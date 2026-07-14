// qvac/invoice.test.js
// Signet — QVAC accessibility layer tests.
// Run: node qvac/invoice.test.js

import { toInvoice, setEngine, localEngine, activeEngine } from './invoice.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}`); }
}

console.log('\nSIGNET QVAC accessibility tests\n');

// 1) the golden phrase: price binds to the item, not a phantom product
let inv = await toInvoice('one coffee, one USDT');
check('"one coffee, one USDT" -> 1 item, total 1',
  inv.items.length === 1 && inv.items[0].name === 'coffee' && inv.total === 1);

// 2) explicit inline price: "coffee 2 usdt"
inv = await toInvoice('coffee 2 usdt');
check('"coffee 2 usdt" -> price 2, total 2',
  inv.items[0].price === 2 && inv.total === 2);

// 3) quantity multiplies price
inv = await toInvoice('two coffee 2 usdt');
check('"two coffee 2 usdt" -> qty 2 * 2 = total 4',
  inv.items[0].quantity === 2 && inv.total === 4);

// 4) multiple items separated by 'and'
inv = await toInvoice('one coffee 1 usdt and two water 1 usdt');
check('multi-item "and" -> 2 items, total 3',
  inv.items.length === 2 && inv.total === 3);

// 5) explicit total overrides line math
inv = await toInvoice('coffee, water, total 5 usdt');
check('"total 5 usdt" -> total 5', inv.total === 5);

// 6) Turkish: "iki su" (two water)
inv = await toInvoice('iki su ve bir sandvic, toplam 3');
check('Turkish "iki su … toplam 3" -> 2 items, total 3',
  inv.items.length === 2 && inv.items[0].quantity === 2 && inv.total === 3);

// 7) Spanish: "dos cafe" (two coffee)
inv = await toInvoice('dos cafe 2 usdt');
check('Spanish "dos cafe 2 usdt" -> qty 2, total 4',
  inv.items[0].quantity === 2 && inv.total === 4);

// 8) empty / garbage input degrades safely
inv = await toInvoice('');
check('empty input -> valid empty invoice', inv.items.length === 0 && inv.total === 0 && inv.currency === 'USDT');

// 9) output shape is always guaranteed (normalization)
inv = await toInvoice('one coffee, one USDT');
check('shape guaranteed { items, total, currency, raw }',
  Array.isArray(inv.items) && typeof inv.total === 'number' && inv.currency === 'USDT' && typeof inv.raw === 'string');

// 10) pluggable engine: swap in a mock QVAC engine, then restore
const mock = async (input) => ({ items: [{ name: 'mocked', quantity: 3, price: 7 }], total: 21, currency: 'USDT', raw: input });
mock.engineName = 'qvac';
setEngine(mock);
const before = activeEngine();
inv = await toInvoice('anything the mock wants');
setEngine(localEngine);
check('setEngine swaps engine + output normalized',
  before === 'qvac' && inv.items[0].name === 'mocked' && inv.total === 21 && activeEngine() === 'local-parser');

console.log(`\n${fail === 0 ? '🎉 all passed' : '⚠️  some failed'} — ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);