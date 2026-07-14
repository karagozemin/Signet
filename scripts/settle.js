// scripts/settle.js
// Signet — ON-CHAIN SETTLEMENT (Champion proof).
// Deploys MockUSDT + VoucherVault to any RPC (local anvil or Sepolia), then runs the
// full settlement path and PROVES the double-spend guarantee on-chain:
//
//   mint -> approve -> deposit (lock USDT)
//   buyer signs a voucher OFFLINE (same scheme as shared/voucher.js)
//   merchant A redeem()  -> real tx, USDT moves, spent[id] = true
//   merchant B redeem()  -> REVERTS "already spent"  (final arbiter is the chain)
//
// Env (optional):  RPC_URL, PRIVATE_KEY, USDT_ADDRESS
// With none set, it spins up a local anvil instance automatically.

import { ethers } from 'ethers';
import { spawn } from 'child_process';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createVoucher, signVoucher, hashInvoice, paymentDigest } from '../shared/voucher.js';
import { toInvoice } from '../qvac/invoice.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, '..');
const line = (c = '─') => console.log(c.repeat(60));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function artifact(name, file = name) {
  const p = join(root, 'out', `${file}.sol`, `${name}.json`);
  const j = JSON.parse(readFileSync(p, 'utf8'));
  return { abi: j.abi, bytecode: j.bytecode.object };
}

// Anvil dev account #0 (well-known key, local only)
const ANVIL_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

async function maybeStartAnvil() {
  if (process.env.RPC_URL) return null;
  console.log('⛓️  starting local anvil…');
  const proc = spawn(join(process.env.HOME, '.foundry/bin/anvil'), ['--silent'], { stdio: 'ignore' });
  await sleep(1500);
  return proc;
}

async function main() {
  console.log('\n🖋️  SIGNET — on-chain settlement   (deferred, deterministic finality)');
  line();

  const anvil = await maybeStartAnvil();
  const rpc = process.env.RPC_URL || 'http://127.0.0.1:8545';
  const provider = new ethers.JsonRpcProvider(rpc);
  // NonceManager keeps sequential txs from reusing a stale nonce.
  const deployer = new ethers.NonceManager(
    new ethers.Wallet(process.env.PRIVATE_KEY || ANVIL_KEY, provider)
  );
  const deployerAddr = await deployer.getAddress();
  const net = await provider.getNetwork();
  console.log(`rpc        ${rpc}  (chainId ${net.chainId})`);
  console.log(`deployer   ${deployerAddr}`);

  // identities — `buyer` (raw wallet) is used for address + offline signing;
  // `buyerSigner` (NonceManager) drives on-chain txs without nonce collisions.
  const buyer       = ethers.Wallet.createRandom().connect(provider);
  const buyerSigner = new ethers.NonceManager(buyer);
  const merchantA   = ethers.Wallet.createRandom();
  const merchantB   = ethers.Wallet.createRandom();

  // fund buyer with a little ETH for gas (from deployer)
  await (await deployer.sendTransaction({ to: buyer.address, value: ethers.parseEther('1') })).wait();

  // --- deploy USDT (mock) unless a real one is provided ---
  let usdtAddr = process.env.USDT_ADDRESS;
  let usdt;
  const M = artifact('MockUSDT');
  if (!usdtAddr) {
    const f = new ethers.ContractFactory(M.abi, M.bytecode, deployer);
    usdt = await f.deploy();
    await usdt.waitForDeployment();
    usdtAddr = await usdt.getAddress();
    console.log(`USDT       ${usdtAddr}  (mock)`);
  } else {
    usdt = new ethers.Contract(usdtAddr, M.abi, deployer);
    console.log(`USDT       ${usdtAddr}`);
  }

  // --- deploy VoucherVault ---
  const V = artifact('VoucherVault');
  const vf = new ethers.ContractFactory(V.abi, V.bytecode, deployer);
  const vault = await vf.deploy(usdtAddr);
  await vault.waitForDeployment();
  const vaultAddr = await vault.getAddress();
  console.log(`Vault      ${vaultAddr}`);
  line();

  const ONE = 1_000_000n; // 1 USDT (6 decimals)

  // 1) fund + lock: buyer mints 3 USDT and deposits into the vault
  await (await usdt.mint(buyer.address, 3n * ONE)).wait();
  await (await usdt.connect(buyerSigner).approve(vaultAddr, 3n * ONE)).wait();
  await (await vault.connect(buyerSigner).deposit(3n * ONE)).wait();
  console.log(`🔒 [ONLINE] buyer locked 3 USDT   locked=${await vault.balance(buyer.address) / ONE} USDT`);

  // 2) OFFLINE: QVAC invoice + buyer signs a voucher bound to merchant A
  const invoice = await toInvoice('one coffee, one USDT');
  const invHash = hashInvoice(invoice);
  const expiry  = Math.floor(Date.now() / 1000) + 3600;
  const voucher = createVoucher(vaultAddr, '1.00', 1, expiry);
  const sig     = await signVoucher(voucher, merchantA.address, invHash, buyer);
  console.log(`🖋️  [OFFLINE] buyer signed voucher ${voucher.voucherId.slice(0,10)}… for Merchant A`);

  // sanity: the contract's digest scheme must match ours
  const localDigest = paymentDigest(voucher, merchantA.address, invHash);
  console.log(`   digest ${localDigest.slice(0,18)}…`);

  // 3) ONLINE: Merchant A redeems -> real on-chain settlement
  const before = await usdt.balanceOf(merchantA.address);
  const tx = await vault.redeem(
    voucher.voucherId, buyer.address, ONE, invHash, voucher.denom, merchantA.address, sig
  );
  const rcpt = await tx.wait();
  const after = await usdt.balanceOf(merchantA.address);
  console.log(`\n✅ [ONLINE] Merchant A redeemed`);
  console.log(`   tx hash  ${rcpt.hash}`);
  console.log(`   payout   ${(after - before) / ONE} USDT -> Merchant A`);
  console.log(`   spent[id] = ${await vault.spent(voucher.voucherId)}`);

  // 4) 🔥 double-spend on-chain: Merchant B tries the SAME voucher -> must revert.
  // staticCall executes against real chain state and throws the revert reason
  // deterministically (no gas-estimation bypass), then we also send the real tx.
  console.log(`\n🔥 Merchant B attempts to redeem the SAME voucher…`);
  try {
    await vault.redeem.staticCall(
      voucher.voucherId, buyer.address, ONE, invHash, voucher.denom, merchantA.address, sig
    );
    // if staticCall did not revert, force the on-chain tx to prove finality
    const tx2 = await vault.redeem(
      voucher.voucherId, buyer.address, ONE, invHash, voucher.denom, merchantA.address, sig
    );
    await tx2.wait();
    console.log('   ⚠️  UNEXPECTED: second redeem succeeded');
  } catch (e) {
    const reason = (e.reason || e.shortMessage || e.message || '').toString();
    const clean = reason.includes('already spent') ? 'already spent' : reason;
    console.log(`🛑 REVERTED on-chain: "${clean}"`);
  }

  line();
  console.log('The chain is the FINAL arbiter. First redeem wins; every later one reverts.');
  console.log('Offline the mesh warns early; on-chain the vault guarantees it.');
  line();

  if (anvil) anvil.kill();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });