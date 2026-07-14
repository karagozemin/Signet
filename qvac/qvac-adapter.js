// qvac/qvac-adapter.js
// Signet — QVAC SDK adapter (integration seam).
//
// This is the ONE place the real QVAC on-device SDK gets wired in. The rest of the
// app only ever calls `toInvoice()` from ./invoice.js, which delegates to whatever
// engine is registered here. Swapping the local parser for QVAC is a single call:
//
//     import { useQvac } from './qvac/qvac-adapter.js';
//     await useQvac();          // registers the QVAC engine process-wide
//
// The engine contract is intentionally tiny and stable:
//     async (input: string) => { items, total, currency, raw }
//
// Because QVAC runs fully on-device, this keeps Signet's "no cloud AI" guarantee.

import { setEngine, localEngine } from './invoice.js';

/**
 * Attempt to load and register the real QVAC SDK as the active engine.
 * Falls back to the deterministic on-device parser if the SDK is unavailable,
 * so the app degrades gracefully instead of breaking.
 *
 * @param {object} [opts]
 * @param {string} [opts.model]  on-device model id, if the SDK needs one
 * @returns {Promise<'qvac'|'local-parser'>} which engine ended up active
 */
export async function useQvac(opts = {}) {
  try {
    // Lazy, optional import: the SDK is not a hard dependency of Signet.
    // When the QVAC SDK ships, install it and expose a compatible call here.
    const mod = await import(/* @vite-ignore */ 'qvac-sdk').catch(() => null);
    if (!mod) throw new Error('qvac-sdk not installed');

    const session = await mod.createSession({ model: opts.model || 'invoice-nlu' });

    const engine = async (input) => {
      // The SDK is expected to return structured intent; we map it to our shape.
      const r = await session.parseOrder(input);
      return {
        items: (r.items || []).map((i) => ({
          name: i.name,
          quantity: i.quantity ?? 1,
          price: i.price ?? null,
        })),
        total: r.total,
        currency: r.currency || 'USDT',
        raw: input.trim(),
      };
    };
    engine.engineName = 'qvac';
    setEngine(engine);
    return 'qvac';
  } catch {
    // graceful fallback — commerce must never break because AI is unavailable
    setEngine(localEngine);
    return 'local-parser';
  }
}