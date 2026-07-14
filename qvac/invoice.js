// qvac/invoice.js
// Signet — QVAC accessibility layer: local-language speech/text -> structured invoice.
//
// ROLE: QVAC provides ACCESSIBILITY, not security. It turns how a merchant naturally
// speaks ("one coffee, one USDT") into a machine invoice. Cryptography secures the
// money; the AI only makes self-custodial payment usable for low-literacy / local-language
// users. All processing is on-device, zero cloud.
//
// ARCHITECTURE: `toInvoice()` is engine-agnostic. It calls the active engine via a stable
// interface — async (input) => invoice. Today the deterministic on-device parser backs it;
// when the QVAC SDK is available it registers as the engine and app code never changes.
//
//   setEngine(fn)   -> plug in the real QVAC SDK (or a mock) at runtime
//   toInvoice(text) -> always returns { items, total, currency, raw }

const NUM_WORDS = {
  // English 0-20
  zero:0, one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10,
  eleven:11, twelve:12, thirteen:13, fourteen:14, fifteen:15, twenty:20,
  // Turkish
  sifir:0, 'sıfır':0, bir:1, iki:2, uc:3, 'üç':3, dort:4, 'dört':4, bes:5, 'beş':5,
  alti:6, 'altı':6, yedi:7, sekiz:8, dokuz:9, on:10,
  // Spanish
  uno:1, una:1, dos:2, tres:3, cuatro:4, cinco:5, seis:6, siete:7, ocho:8, nueve:9, diez:10
};

function word2num(tok) {
  if (tok == null) return null;
  if (/^\d+(?:\.\d+)?$/.test(tok)) return Number(tok);
  return NUM_WORDS[tok.toLowerCase()] ?? null;
}

const CUR_RE = /^(usdt|usdc|usd|dollars?|dolar|dólar|dolares?)$/i;
const stripName = (arr) => arr.filter(t => !CUR_RE.test(t) && word2num(t) == null).join(' ').trim();

/**
 * The deterministic, on-device engine. Fully offline, zero cloud.
 * This is the default engine and the reference implementation of the interface
 * the QVAC SDK is expected to fulfil: async (input) => invoice.
 *
 * @param {string} input  e.g. "one coffee, one USDT" | "iki su bir sandvic"
 * @returns {Promise<{items:Array,total:number,currency:string,raw:string}>}
 */
export async function localEngine(input) {
  const raw = String(input || '').trim();
  const currency = 'USDT';
  const items = [];
  let explicitTotal = null;

  // split on commas / 'and' / 've'
  const parts = raw.split(/,| and | ve /i).map(s => s.trim()).filter(Boolean);

  for (const part of parts) {
    const toks = part.split(/\s+/);
    const hasCurrency = toks.some(t => CUR_RE.test(t));
    const numInPart = toks.map(word2num).find(v => v != null);
    const nameInPart = stripName(toks);

    // explicit total: "total 3 usdt" / "toplam 3"
    if (/total|toplam/i.test(part)) {
      if (numInPart != null) explicitTotal = numInPart;
      continue;
    }

    // a clause that is ONLY a money amount (no item name), e.g. "one USDT".
    // treat it as the price of the previous item, or as the invoice total.
    if (hasCurrency && !nameInPart && numInPart != null) {
      if (items.length && items[items.length - 1].price == null) {
        items[items.length - 1].price = numInPart;
      } else {
        explicitTotal = numInPart;
      }
      continue;
    }

    // pattern: <qty> <name...> [<price> usdt]
    const qty = word2num(toks[0]);
    const rest = qty != null ? toks.slice(1) : toks;
    const pIdx = rest.findIndex(t => CUR_RE.test(t));
    let price = null, name;
    if (pIdx > 0 && word2num(rest[pIdx - 1]) != null) {
      price = word2num(rest[pIdx - 1]);
      name = stripName(rest.slice(0, pIdx));
    } else {
      name = stripName(rest);
    }
    if (name) items.push({ name, quantity: qty != null ? qty : 1, price });
  }

  const total = explicitTotal != null
    ? explicitTotal
    : items.reduce((s, it) => s + (it.price != null ? it.price * it.quantity : 0), 0);

  return { items, total, currency, raw };
}

// ── engine registry ────────────────────────────────────────────────────────
// The active engine. Defaults to the on-device parser; swap for the QVAC SDK.
let _engine = localEngine;

/**
 * Register the active accessibility engine (e.g. the real QVAC SDK).
 * The engine MUST honor the interface: async (input:string) => invoice.
 * @param {(input:string)=>Promise<object>} fn
 */
export function setEngine(fn) {
  if (typeof fn !== 'function') throw new TypeError('engine must be a function');
  _engine = fn;
}

/** Name of the active engine, for logging/diagnostics. */
export function activeEngine() {
  return _engine === localEngine ? 'local-parser' : (_engine.engineName || 'custom');
}

/**
 * Convert natural-language speech/text into a structured invoice using the
 * active engine, then normalize + validate the shape so downstream code
 * (voucher signing, on-chain redeem) can always trust the output.
 *
 * @param {string} input
 * @returns {Promise<{items:Array,total:number,currency:string,raw:string}>}
 */
export async function toInvoice(input) {
  const out = await _engine(String(input || ''));
  // normalize/validate: guarantee the contract regardless of engine internals
  const items = Array.isArray(out?.items) ? out.items.map(it => ({
    name: String(it.name || '').trim(),
    quantity: Number.isFinite(it.quantity) ? it.quantity : 1,
    price: it.price == null ? null : Number(it.price)
  })) : [];
  const total = Number.isFinite(out?.total)
    ? out.total
    : items.reduce((s, it) => s + (it.price != null ? it.price * it.quantity : 0), 0);
  return { items, total, currency: out?.currency || 'USDT', raw: out?.raw ?? String(input || '').trim() };
}