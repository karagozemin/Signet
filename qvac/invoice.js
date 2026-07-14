// qvac/invoice.js
// Signet — QVAC accessibility layer: local-language speech/text -> structured invoice.
//
// ROLE: QVAC provides ACCESSIBILITY, not security. It turns how a merchant naturally
// speaks ("one coffee, one USDT") into a machine invoice. Cryptography secures the
// money; the AI only makes self-custodial payment usable for low-literacy / local-language
// users. All processing is on-device, zero cloud.
//
// Until the QVAC SDK is wired in, `toInvoice()` uses a deterministic local parser with
// the SAME interface the SDK call will expose, so the app code never changes.

const NUM_WORDS = {
  zero:0, one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10,
  bir:1, iki:2, uc:3, 'üç':3, dort:4, 'dört':4, bes:5, 'beş':5,
  uno:1, dos:2, tres:3, cuatro:4, cinco:5
};

function word2num(tok) {
  if (tok == null) return null;
  if (/^\d+(?:\.\d+)?$/.test(tok)) return Number(tok);
  return NUM_WORDS[tok.toLowerCase()] ?? null;
}

/**
 * Convert a natural-language order into a structured invoice, on-device.
 * Interface mirrors the future QVAC SDK call: async (input) => invoice.
 *
 * @param {string} input  e.g. "one coffee, one USDT" | "iki su bir sandvic"
 * @returns {Promise<{items:Array,total:number,currency:string,raw:string}>}
 */
const CUR_RE = /^(usdt|usd|dollars?)$/i;
const stripName = (arr) => arr.filter(t => !CUR_RE.test(t) && word2num(t) == null).join(' ').trim();

export async function toInvoice(input) {
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