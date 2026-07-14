// app/signet.js
// Signet — THE unified end-to-end story, in one run.
//
//   🌐 ONLINE          buyer locks USDT in the VoucherVault
//   ✈️  OFFLINE         QVAC turns speech -> invoice; buyer signs a voucher;
//                      Merchant A accepts it over the Pears mesh; the SAME voucher
//                      handed to Merchant B is rejected LOCALLY (mesh early-warning)
//   🌐 RECONNECT       Merchant A redeems on-chain (real tx); a second on-chain
//                      redeem of the same voucher REVERTS (chain = final arbiter)
//
// Default: spins up a local anvil (fast, repeatable). Point at any RPC via env:
//   RPC_URL=... PRIVATE_KEY=... npm run signet         (e.g. live Sepolia)

import { ethers } from 'ethers';
import { spawn } from 'child_process';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { SignetMesh } from '../peer/mesh.js';
import { toInvoice } from '../qvac/invoice.js';
import { createVoucher, signVoucher, verifyVoucher, hashInvoice } from '../shared/voucher.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, '..');
const line = (c = '─') => console.log(c.repeat(64));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const ANVIL_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

function artifact(name, file = name) {
  const p = join(root, 'out', `${file}.sol`, `${name}.json`);
  const j = JSON.parse(readFileSync(p, 'utf8'));
  return { abi: j.abi, bytecode: j.bytecode.object };
}

async function maybeStartAnvil() {
  if (process.env.RPC_URL) return null;
  const proc = spawn(join(process.env.HOME, '.foundry/bin/anvil'), ['--silent'], { stdio: 'ignore' });
  await sleep(1800);
  return proc;
}

async function main() {
  console.log('\n🖋️  SIGNET — value, sealed.   (offline commerce, on-chain finality)');
  line();

  // ── chain setup ─────────────────────────────────────────────────────────
  const anvil = await maybeStartAnvil();
  const rpc = process.env.RPC_URL || 'http://127.0.0.1:8545';
  const provider = new ethers.JsonRpcProvider(rpc);
  const deployer = new ethers.NonceManager(
    new ethers.Wallet(process.env.PRIVATE_KEY || ANVIL_KEY, provider)
  );
  const chainId = Number((await provider.getNetwork()).chainId);
  const EXPLORER = { 11155111: 'https://sepolia.etherscan.io' }[chainId];
  const txLink = (h) => EXPLORER ? `${EXPLORER}/tx/${h}` : `(local) ${h}`;
  const local = chainId === 31337;

  // identities
  const buyer       = ethers.Wallet.createRandom().connect(provider);
  const buyerSigner = new ethers.NonceManager(buyer);
  const merchantA   = ethers.Wallet.createRandom();
  const merchantB   = ethers.Wallet.createRandom();
  console.log(`chain      ${local ? 'local anvil' : 'chainId ' + chainId}`);
  console.log(`buyer      ${buyer.address}`);
  console.log(`merchantA  ${merchantA.address}`);
  console.log(`merchantB  ${merchantB.address}`);

  await (await deployer.sendTransaction({
    to: buyer.address, value: local ? ethers.parseEther('1') : ethers.parseEther('0.01')
  })).wait();

  // deploy USDT + vault
  const M = artifact('MockUSDT'), V = artifact('VoucherVault');
  const usdt = await new ethers.ContractFactory(M.abi, M.bytecode, deployer).deploy();
  await usdt.waitForDeployment();
  const usdtAddr = await usdt.getAddress();
  const vault = await new ethers.ContractFactory(V.abi, V.bytecode, deployer).deploy(usdtAddr);
  await vault.waitForDeployment();
  const vaultAddr = await vault.getAddress();
  const ONE = 1_000_000n;

  // ── 🌐 ONLINE: lock funds ────────────────────────────────────────────────
  line();
  console.log('🌐 ONLINE — buyer pre-funds the vault while connectivity exists');
  await (await usdt.mint(buyer.address, 3n * ONE)).wait();
  await (await usdt.connect(buyerSigner).approve(vaultAddr, 3n * ONE)).wait();
  await (await vault.connect(buyerSigner).deposit(3n * ONE)).wait();
  console.log(`🔒 locked ${await vault.balance(buyer.address) / ONE} USDT in VoucherVault ${vaultAddr.slice(0,10)}…`);

  // ── join the serverless mesh ───────────────────��─────────────────────────
  const buyerMesh = await new SignetMesh('buyer').join();
  const meshA = await new SignetMesh('merchant-a').join();
  const meshB = await new SignetMesh('merchant-b').join();
  process.stdout.write('⏳ discovering peers over Pears');
  for (let i = 0; i < 20 && (meshA.peers.size < 1 || meshB.peers.size < 1); i++) {
    process.stdout.write('.'); await sleep(500);
  }
  console.log(` connected (A:${meshA.peers.size} B:${meshB.peers.size})`);

  // merchant A: accept offline + replicate spend across mesh
  let acceptedVoucher = null, acceptedSig = null, acceptedInvHash = null;
  meshA.on('voucher', ({ to, voucher, signature, invoice, buyer: b }) => {
    if (to !== merchantA.address || meshA.isSeen(voucher.voucherId)) return;
    const invHash = hashInvoice(invoice);
    if (verifyVoucher(voucher, signature, merchantA.address, invHash, b)) {
      meshA.markSpent(voucher.voucherId);
      acceptedVoucher = voucher; acceptedSig = signature; acceptedInvHash = invHash;
      console.log(`\n✅ [Merchant A] ACCEPTED OFFLINE  ${voucher.denom} USDT  (sig valid, funds pre-locked)`);
    } else console.log('\n❌ [Merchant A] invalid signature');
  });
  // merchant B: same voucher must be rejected locally
  meshB.on('voucher', async ({ to, voucher }) => {
    if (to !== merchantB.address) return;
    await sleep(300);
    console.log(meshB.isSeen(voucher.voucherId)
      ? `\n🛑 [Merchant B] REJECTED: voucher ${voucher.voucherId.slice(0,10)}… already seen in local mesh`
      : '\n⚠️  [Merchant B] would accept — mesh had not yet replicated spend');
  });

  // ── ✈️ OFFLINE: speak, sign, accept, double-spend blocked ────────────────
  line();
  console.log('✈️  AIRPLANE MODE — no internet. Commerce continues on the local mesh.');
  line();
  const invoice = await toInvoice('one coffee, one USDT');
  console.log('🎙️  [QVAC] "one coffee, one USDT" ->', JSON.stringify(invoice));
  const invHash = hashInvoice(invoice);
  const expiry = Math.floor(Date.now()/1000) + 3600;
  const voucher = createVoucher(vaultAddr, '1.00', 1, expiry);
  const sig = await signVoucher(voucher, merchantA.address, invHash, buyer);
  console.log(`🖋️  [Buyer] signed voucher ${voucher.voucherId.slice(0,10)}… for Merchant A`);

  buyerMesh.sendVoucher({ to: merchantA.address, voucher, signature: sig, invoice, buyer: buyer.address });
  await sleep(1200);
  console.log('\n🔥 Buyer tries to spend the SAME voucher again at Merchant B…');
  buyerMesh.sendVoucher({ to: merchantB.address, voucher, signature: sig, invoice, buyer: buyer.address });
  await sleep(1500);

  // ── 🌐 RECONNECT: settle on-chain ────────────────────────────────────────
  line();
  console.log('🌐 CONNECTIVITY RETURNS — Merchant A settles the accepted voucher on-chain');
  line();
  const v = acceptedVoucher || voucher;
  const s = acceptedSig || sig;
  const ih = acceptedInvHash || invHash;
  const before = await usdt.balanceOf(merchantA.address);
  const tx = await vault.redeem(v.voucherId, buyer.address, ONE, ih, v.denom, merchantA.address, s);
  const rcpt = await tx.wait();
  const after = await usdt.balanceOf(merchantA.address);
  console.log(`✅ [ON-CHAIN] Merchant A redeemed  ${(after - before) / ONE} USDT`);
  console.log(`   tx       ${txLink(rcpt.hash)}`);
  console.log(`   spent[id]= ${await vault.spent(v.voucherId)}`);

  console.log('\n🔥 A second on-chain redeem of the SAME voucher…');
  try {
    await vault.redeem.staticCall(v.voucherId, buyer.address, ONE, ih, v.denom, merchantA.address, s);
    console.log('   ⚠️  UNEXPECTED: second redeem did not revert');
  } catch (e) {
    const r = (e.reason || e.shortMessage || e.message || '').toString();
    console.log(`🛑 REVERTED on-chain: "${r.includes('already spent') ? 'already spent' : r}"`);
  }

  line();
  console.log('Offline, the mesh warns early. On-chain, the vault guarantees it.');
  console.log('No bank. No server. No cloud AI. Connectivity can vanish; commerce need not.');
  line();

  await buyerMesh.destroy(); await meshA.destroy(); await meshB.destroy();
  if (anvil) anvil.kill();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });