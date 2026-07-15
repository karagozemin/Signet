// bridge/server.js
// Signet Bridge — the seam between the browser UI and the REAL system.
//
// The browser cannot run Hyperswarm or hold keys, so this Node service runs the
// actual mesh peers (buyer, Merchant A, Merchant B), the voucher crypto, the QVAC
// parser and the on-chain settlement — then streams every real event to the UI over
// WebSocket and accepts actions over REST. Nothing in the UI is faked; it is a live
// window onto this process.
//
// Run:  node bridge/server.js            (local anvil, auto-spawned)
//       node --env-file=.env bridge/server.js   (uses RPC_URL/PRIVATE_KEY if set)

import http from 'http';
import { spawn } from 'child_process';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { WebSocketServer } from 'ws';
import { ethers } from 'ethers';
import { SignetMesh } from '../peer/mesh.js';
import { toInvoice, activeEngine } from '../qvac/invoice.js';
import { createVoucher, signVoucher, verifyVoucher, hashInvoice } from '../shared/voucher.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, '..');
const PORT = Number(process.env.BRIDGE_PORT || 8787);
const ANVIL_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const ONE = 1_000_000n;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function artifact(name) {
  const p = join(root, 'out', `${name}.sol`, `${name}.json`);
  const j = JSON.parse(readFileSync(p, 'utf8'));
  return { abi: j.abi, bytecode: j.bytecode.object };
}

// ── live event bus ─────────────────────────────────────────────────────────
const clients = new Set();
const history = [];
function emit(type, data = {}) {
  const evt = { type, data, t: Date.now() };
  history.push(evt);
  const msg = JSON.stringify(evt);
  for (const ws of clients) { try { ws.send(msg); } catch {} }
}

// ── session state ──────────────────────────────────────────────────────────
let S = null; // the live session

async function maybeStartAnvil() {
  if (process.env.RPC_URL) return null;
  emit('log', { msg: 'starting local anvil…' });
  const proc = spawn(join(process.env.HOME, '.foundry/bin/anvil'), ['--silent'], { stdio: 'ignore' });
  await sleep(1800);
  return proc;
}

async function initSession() {
  if (S?.busy) throw new Error('session busy');
  // tear down previous
  if (S) await destroySession().catch(() => {});
  S = { busy: true };

  const anvil = await maybeStartAnvil();
  const rpc = process.env.RPC_URL || 'http://127.0.0.1:8545';
  const provider = new ethers.JsonRpcProvider(rpc);
  const deployer = new ethers.NonceManager(new ethers.Wallet(process.env.PRIVATE_KEY || ANVIL_KEY, provider));
  const chainId = Number((await provider.getNetwork()).chainId);
  const local = chainId === 31337;
  const EXPLORER = { 11155111: 'https://sepolia.etherscan.io' }[chainId] || null;

  const buyer = ethers.Wallet.createRandom().connect(provider);
  const buyerSigner = new ethers.NonceManager(buyer);
  const merchantA = ethers.Wallet.createRandom();
  const merchantB = ethers.Wallet.createRandom();

  emit('session:chain', {
    chainId, local, rpc, explorer: EXPLORER,
    buyer: buyer.address, merchantA: merchantA.address, merchantB: merchantB.address,
    engine: activeEngine(),
  });

  // fund buyer for gas
  await (await deployer.sendTransaction({
    to: buyer.address, value: local ? ethers.parseEther('1') : ethers.parseEther('0.01'),
  })).wait();

  // deploy USDT + vault
  const M = artifact('MockUSDT'), V = artifact('VoucherVault');
  const usdt = await new ethers.ContractFactory(M.abi, M.bytecode, deployer).deploy();
  await usdt.waitForDeployment();
  const usdtAddr = await usdt.getAddress();
  const vault = await new ethers.ContractFactory(V.abi, V.bytecode, deployer).deploy(usdtAddr);
  await vault.waitForDeployment();
  const vaultAddr = await vault.getAddress();
  emit('session:contracts', { usdt: usdtAddr, vault: vaultAddr });

  // pre-fund + lock 3 USDT
  await (await usdt.mint(buyer.address, 3n * ONE)).wait();
  await (await usdt.connect(buyerSigner).approve(vaultAddr, 3n * ONE)).wait();
  await (await vault.connect(buyerSigner).deposit(3n * ONE)).wait();
  const locked = await vault.balance(buyer.address);
  emit('deposit', { locked: Number(locked / ONE) });

  // join meshes
  const buyerMesh = await new SignetMesh('buyer').join();
  const meshA = await new SignetMesh('merchant-a').join();
  const meshB = await new SignetMesh('merchant-b').join();
  // Wait for a fully-formed 3-node swarm: every peer must see the other two.
  // A partial mesh (e.g. buyer not linked to A) silently drops the voucher.
  const fullyConnected = () =>
    buyerMesh.peers.size >= 2 && meshA.peers.size >= 2 && meshB.peers.size >= 2;
  for (let i = 0; i < 50 && !fullyConnected(); i++) await sleep(400);
  if (!fullyConnected()) {
    emit('log', { msg: `mesh partial (buyer:${buyerMesh.peers.size} a:${meshA.peers.size} b:${meshB.peers.size}) — continuing` });
  }
  emit('mesh:connected', { buyer: buyerMesh.peers.size, a: meshA.peers.size, b: meshB.peers.size });


  // merchant A: verify + accept offline, replicate spend
  meshA.on('voucher', ({ to, voucher, signature, invoice, buyer: b }) => {
    if (to !== merchantA.address || meshA.isSeen(voucher.voucherId)) return;
    const invHash = hashInvoice(invoice);
    if (verifyVoucher(voucher, signature, merchantA.address, invHash, b)) {
      meshA.markSpent(voucher.voucherId);
      S.accepted = { voucher, signature, invHash };
      emit('merchant:accepted', { by: 'A', voucherId: voucher.voucherId, denom: voucher.denom });
    } else {
      emit('merchant:invalid', { by: 'A' });
    }
  });
  // merchant B: must reject a duplicate seen on the mesh
  meshB.on('voucher', async ({ to, voucher }) => {
    if (to !== merchantB.address) return;
    await sleep(300);
    emit(meshB.isSeen(voucher.voucherId) ? 'merchant:rejected' : 'merchant:would-accept',
      { by: 'B', voucherId: voucher.voucherId });
  });

  S = {
    busy: false, anvil, provider, deployer, chainId, local, explorer: EXPLORER,
    buyer, buyerSigner, merchantA, merchantB, usdt, vault, vaultAddr,
    buyerMesh, meshA, meshB, invoice: null, voucher: null, sig: null, accepted: null,
  };
  emit('session:ready', {});
  return S;
}

async function destroySession() {
  if (!S) return;
  try { await S.buyerMesh?.destroy(); } catch {}
  try { await S.meshA?.destroy(); } catch {}
  try { await S.meshB?.destroy(); } catch {}
  try { S.anvil?.kill(); } catch {}
  S = null;
}

// ── actions ────────────────────────────────────────────────────────────────
async function doInvoice(text) {
  const invoice = await toInvoice(text || 'one coffee, one USDT');
  S.invoice = invoice;
  emit('qvac:invoice', { input: text, invoice, engine: activeEngine() });
  return invoice;
}

async function doSign() {
  if (!S.invoice) await doInvoice('one coffee, one USDT');
  const invHash = hashInvoice(S.invoice);
  const expiry = Math.floor(Date.now() / 1000) + 3600;
  const voucher = createVoucher(S.vaultAddr, '1.00', 1, expiry);
  const sig = await signVoucher(voucher, S.merchantA.address, invHash, S.buyer);
  S.voucher = voucher; S.sig = sig;
  emit('voucher:signed', { voucherId: voucher.voucherId, denom: voucher.denom, merchant: 'A' });
  return { voucherId: voucher.voucherId };
}

async function doSend(to) {
  if (!S.voucher) await doSign();
  const target = to === 'B' ? S.merchantB.address : S.merchantA.address;
  emit('voucher:sent', { to, voucherId: S.voucher.voucherId });
  S.buyerMesh.sendVoucher({
    to: target, voucher: S.voucher, signature: S.sig, invoice: S.invoice, buyer: S.buyer.address,
  });
  return { ok: true };
}

async function doRedeem() {
  const a = S.accepted || { voucher: S.voucher, signature: S.sig, invHash: hashInvoice(S.invoice) };
  if (!a.voucher) throw new Error('nothing to redeem');
  emit('redeem:pending', { voucherId: a.voucher.voucherId });
  const before = await S.usdt.balanceOf(S.merchantA.address);
  const tx = await S.vault.redeem(
    a.voucher.voucherId, S.buyer.address, ONE, a.invHash, a.voucher.denom, S.merchantA.address, a.signature
  );
  const rcpt = await tx.wait();
  const after = await S.usdt.balanceOf(S.merchantA.address);
  emit('redeem:confirmed', {
    hash: rcpt.hash,
    explorer: S.explorer ? `${S.explorer}/tx/${rcpt.hash}` : null,
    payout: Number((after - before) / ONE),
    spent: await S.vault.spent(a.voucher.voucherId),
  });
  return { hash: rcpt.hash };
}

async function doRedeemAgain() {
  const a = S.accepted || { voucher: S.voucher, signature: S.sig, invHash: hashInvoice(S.invoice) };
  emit('redeem2:pending', {});
  try {
    await S.vault.redeem.staticCall(
      a.voucher.voucherId, S.buyer.address, ONE, a.invHash, a.voucher.denom, S.merchantA.address, a.signature
    );
    emit('redeem2:unexpected', {});
  } catch (e) {
    const r = (e.reason || e.shortMessage || e.message || '').toString();
    emit('redeem2:reverted', { reason: r.includes('already spent') ? 'already spent' : r });
  }
  return { ok: true };
}

// ── HTTP + WS ──────────────────────────────────────────────────────────────
const routes = {
  'POST /api/session/init': async () => { await initSession(); return { ok: true }; },
  'POST /api/invoice': async (body) => ({ invoice: await doInvoice(body.text) }),
  'POST /api/sign': async () => await doSign(),
  'POST /api/send': async (body) => await doSend(body.to),
  'POST /api/redeem': async () => await doRedeem(),
  'POST /api/redeem-again': async () => await doRedeemAgain(),
  'GET /api/health': async () => ({ ok: true, hasSession: !!S }),
};

function readBody(req) {
  return new Promise((resolve) => {
    let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => {
      try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); }
    });
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  const key = `${req.method} ${req.url.split('?')[0]}`;
  const handler = routes[key];
  if (!handler) { res.writeHead(404); return res.end('not found'); }
  try {
    const body = req.method === 'POST' ? await readBody(req) : {};
    const out = await handler(body);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(out ?? { ok: true }));
  } catch (e) {
    emit('error', { msg: String(e.message || e) });
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: String(e.message || e) }));
  }
});

const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws) => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: 'hello', data: { history }, t: Date.now() }));
  ws.on('close', () => clients.delete(ws));
});

server.listen(PORT, () => {
  console.log(`🌉 Signet bridge on http://127.0.0.1:${PORT}  (ws: /ws)`);
  console.log(`   ${process.env.RPC_URL ? 'RPC: ' + process.env.RPC_URL : 'local anvil (auto)'}`);
});

process.on('SIGINT', async () => { await destroySession(); process.exit(0); });
process.on('SIGTERM', async () => { await destroySession(); process.exit(0); });