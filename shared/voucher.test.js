// shared/voucher.test.js — quick offline sanity checks for the voucher core.
import { ethers } from 'ethers';
import { createVoucher, signVoucher, verifyVoucher, hashInvoice } from './voucher.js';
import { toInvoice } from '../qvac/invoice.js';

let pass = 0, fail = 0;
const ok  = (c, m) => c ? (pass++, console.log('  ✅', m)) : (fail++, console.log('  ❌', m));

const VAULT = '0x0000000000000000000000000000000000000001';

const run = async () => {
  console.log('\nSIGNET voucher core tests');

  const buyer     = ethers.Wallet.createRandom();
  const merchantA = ethers.Wallet.createRandom();
  const merchantB = ethers.Wallet.createRandom();

  const invoice = await toInvoice('one coffee, one USDT');
  ok(invoice.total === 1 && invoice.currency === 'USDT', `QVAC parsed invoice total=${invoice.total}`);
  const invHash = hashInvoice(invoice);

  const v = createVoucher(VAULT, '1.00', 1, Math.floor(Date.now()/1000)+3600);
  const sig = await signVoucher(v, merchantA.address, invHash, buyer);

  // 1. valid signature recovers buyer for the correct merchant+invoice
  const rec = verifyVoucher(v, sig, merchantA.address, invHash, buyer.address);
  ok(rec && rec.toLowerCase() === buyer.address.toLowerCase(), 'valid voucher verifies to buyer');

  // 2. cannot be redeemed by a DIFFERENT merchant
  ok(verifyVoucher(v, sig, merchantB.address, invHash, buyer.address) === null, 'wrong merchant rejected');

  // 3. cannot be used against a DIFFERENT invoice
  const invHash2 = hashInvoice(await toInvoice('two coffee, two USDT'));
  ok(verifyVoucher(v, sig, merchantA.address, invHash2, buyer.address) === null, 'wrong invoice rejected');

  // 4. expired voucher rejected
  const vx = createVoucher(VAULT, '1.00', 2, Math.floor(Date.now()/1000)-10);
  const sigx = await signVoucher(vx, merchantA.address, invHash, buyer);
  ok(verifyVoucher(vx, sigx, merchantA.address, invHash, buyer.address) === null, 'expired voucher rejected');

  console.log(`\n${fail === 0 ? '🎉 all passed' : '⚠️  failures'} — ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
};
run();