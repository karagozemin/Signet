// app/demo.js
// Signet — end-to-end OFFLINE demo (no internet required).
// Runs a buyer + two merchants on one local Pears mesh and reproduces the golden moment:
// a signed voucher is accepted by Merchant A, then the SAME voucher is REJECTED by
// Merchant B because the local mesh already replicated it as spent.
//
// Run:  npm run demo

import { ethers } from 'ethers';
import { SignetMesh } from '../peer/mesh.js';
import { toInvoice } from '../qvac/invoice.js';
import { createVoucher, signVoucher, verifyVoucher, hashInvoice } from '../shared/voucher.js';

const VAULT = '0x0000000000000000000000000000000000000001'; // placeholder until deployed
const line = (c = '─') => console.log(c.repeat(60));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log('\n🖋️  SIGNET — offline settlement demo   (Value, sealed.)');
  line();

  // --- identities (WDK-style self-custodial keys) ---
  const buyer = ethers.Wallet.createRandom();
  const merchantA = ethers.Wallet.createRandom();
  const merchantB = ethers.Wallet.createRandom();
  console.log('buyer     ', buyer.address);
  console.log('merchantA ', merchantA.address);
  console.log('merchantB ', merchantB.address);

  // --- join the serverless mesh ---
  const buyerMesh = await new SignetMesh('buyer').join();
  const meshA = await new SignetMesh('merchant-a').join();
  const meshB = await new SignetMesh('merchant-b').join();

  process.stdout.write('\n⏳ discovering peers over Pears');
  for (let i = 0; i < 20 && (meshA.peers.size < 1 || meshB.peers.size < 1); i++) {
    process.stdout.write('.'); await sleep(500);
  }
  console.log(`\n🔗 connected (A sees ${meshA.peers.size} peers, B sees ${meshB.peers.size})`);

  // Merchant A accepts a voucher addressed to it, then replicates it as spent.
  meshA.on('voucher', async ({ to, voucher, signature, invoice, buyer: buyerAddr }) => {
    if (to !== merchantA.address) return;              // only handle vouchers sent to me
    if (meshA.isSeen(voucher.voucherId)) return;
    const invHash = hashInvoice(invoice);
    const rec = verifyVoucher(voucher, signature, merchantA.address, invHash, buyerAddr);
    if (rec) {
      meshA.markSpent(voucher.voucherId);
      console.log(`\n✅ [Merchant A] ACCEPTED OFFLINE  ${voucher.denom} USDT  (sig valid, funds pre-locked)`);
    } else {
      console.log('\n❌ [Merchant A] invalid signature');
    }
  });

  // Merchant B tries to accept the SAME voucher -> must be rejected as already-seen.
  meshB.on('voucher', async ({ to, voucher }) => {
    if (to !== merchantB.address) return;              // only handle vouchers sent to me
    await sleep(300); // allow SEEN replication to arrive
    if (meshB.isSeen(voucher.voucherId)) {
      console.log(`\n🛑 [Merchant B] REJECTED: voucher ${voucher.voucherId.slice(0,10)}… already seen in local mesh`);
    } else {
      console.log('\n⚠️  [Merchant B] would accept — mesh had not yet replicated spend');
    }
  });

  // ✈️  OFFLINE PHASE
  line();
  console.log('✈️  AIRPLANE MODE — no internet. Commerce continues on the local mesh.');
  line();

  // 1) QVAC turns local-language speech into a structured invoice (on-device)
  const invoice = await toInvoice('one coffee, one USDT');
  console.log('🎙️  [QVAC] "one coffee, one USDT"  ->', JSON.stringify(invoice));
  const invHash = hashInvoice(invoice);

  // 2) buyer creates + signs a pre-funded voucher bound to Merchant A + this invoice
  const nonce = 1, expiry = Math.floor(Date.now()/1000) + 3600;
  const voucher = createVoucher(VAULT, '1.00', nonce, expiry);
  const sig = await signVoucher(voucher, merchantA.address, invHash, buyer);
  console.log(`🖋️  [Buyer] signed voucher ${voucher.voucherId.slice(0,10)}… for Merchant A`);

  // 3) hand it to Merchant A over Pears
  buyerMesh.sendVoucher({ to: merchantA.address, voucher, signature: sig, invoice, buyer: buyer.address });
  await sleep(1200);

  // 4) 🔥 double-spend attempt: same voucher to Merchant B
  console.log('\n🔥 Buyer tries to spend the SAME voucher again at Merchant B…');
  buyerMesh.sendVoucher({ to: merchantB.address, voucher, signature: sig, invoice, buyer: buyer.address });
  await sleep(1500);

  line();
  console.log('🌐 When connectivity returns, Merchant A calls VoucherVault.redeem()');
  console.log('   -> on-chain `spent` mapping is the FINAL arbiter, real USDT settles.');
  console.log('\nNo bank. No server. No cloud AI. Connectivity can vanish; commerce need not.');
  line();

  await buyerMesh.destroy(); await meshA.destroy(); await meshB.destroy();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });