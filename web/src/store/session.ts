import { create } from 'zustand';

/**
 * The session store — the browser's live mirror of the bridge.
 *
 * It opens ONE WebSocket to the bridge, replays history on connect, and folds
 * every real event into a small, typed view-model the theatre renders. Actions
 * are thin POSTs to the bridge; the truth always comes back over the socket.
 * Nothing here is simulated — every field is populated by a real mesh/chain event.
 */

export type BridgeEvent = { type: string; data: any; t: number };

export type Phase =
  | 'idle'          // not connected / no session
  | 'booting'       // session/init in flight
  | 'ready'         // meshes + chain up, waiting for the buyer
  | 'invoiced'      // QVAC has parsed an invoice
  | 'signed'        // voucher minted + signed
  | 'sent'          // voucher on the mesh
  | 'settled';      // redeemed on-chain

type Verdict = 'idle' | 'pending' | 'accepted' | 'rejected';

export interface SessionState {
  connected: boolean;
  phase: Phase;
  busy: boolean;

  // chain / identities
  chainId: number | null;
  local: boolean;
  explorer: string | null;
  rpc: string | null;
  engine: string | null;
  addr: { buyer?: string; merchantA?: string; merchantB?: string };
  contracts: { usdt?: string; vault?: string };

  // economic state
  locked: number | null;          // USDT locked in vault
  payout: number | null;          // USDT paid to merchant on redeem

  // the note in flight
  invoiceData: any | null;
  invoiceInput: string;

  voucherId: string | null;

  // merchant verdicts
  merchantA: Verdict;
  merchantB: Verdict;

  // settlement
  redeemHash: string | null;
  redeemLink: string | null;
  revertReason: string | null;

  events: BridgeEvent[];
  log: BridgeEvent[];             // human-readable subset for the ledger

  // internals
  _ws: WebSocket | null;

  // actions
  connect: () => void;
  disconnect: () => void;
  fold: (e: BridgeEvent) => void;
  post: (path: string, body?: any) => Promise<any>;
  init: () => Promise<void>;
  invoice: (text: string) => Promise<void>;
  sign: () => Promise<void>;
  send: (to: 'A' | 'B') => Promise<void>;
  redeem: () => Promise<void>;
  redeemAgain: () => Promise<void>;
  setInvoiceInput: (t: string) => void;
  reset: () => void;
}

const LEDGER_TYPES = new Set([
  'log', 'session:chain', 'session:contracts', 'deposit', 'mesh:connected',
  'session:ready', 'qvac:invoice', 'voucher:signed', 'merchant:accepted',
  'merchant:invalid', 'voucher:sent', 'merchant:rejected', 'merchant:would-accept',
  'redeem:pending', 'redeem:confirmed', 'redeem2:pending', 'redeem2:reverted',
  'redeem2:unexpected', 'error',
]);

const initial = {
  connected: false,
  phase: 'idle' as Phase,
  busy: false,
  chainId: null,
  local: false,
  explorer: null as string | null,
  rpc: null as string | null,
  engine: null as string | null,
  addr: {},
  contracts: {},
  locked: null as number | null,
  payout: null as number | null,
  invoiceData: null as any,
  invoiceInput: 'one coffee, one USDT',

  voucherId: null as string | null,
  merchantA: 'idle' as Verdict,
  merchantB: 'idle' as Verdict,
  redeemHash: null as string | null,
  redeemLink: null as string | null,
  revertReason: null as string | null,
  events: [] as BridgeEvent[],
  log: [] as BridgeEvent[],
};

export const useSession = create<SessionState>((set, get) => ({
  ...initial,
  _ws: null,

  connect() {
    if (get()._ws) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);

    ws.onopen = () => set({ connected: true });
    ws.onclose = () => {
      set({ connected: false, _ws: null });
      // gentle auto-reconnect
      setTimeout(() => { if (!get()._ws) get().connect(); }, 1200);
    };
    ws.onmessage = (m) => {
      const evt = JSON.parse(m.data) as BridgeEvent & { data: any };
      if (evt.type === 'hello') {
        // replay full history on (re)connect
        set({ events: [], log: [] });
        for (const e of evt.data.history as BridgeEvent[]) get().fold(e);
        return;
      }
      get().fold(evt);
    };

    set({ _ws: ws });
  },

  disconnect() {
    const ws = get()._ws;
    if (ws) { ws.onclose = null; ws.close(); }
    set({ _ws: null, connected: false });
  },

  fold(e) {
    const patch: Partial<SessionState> = {};
    switch (e.type) {
      case 'session:chain':
        patch.chainId = e.data.chainId;
        patch.local = e.data.local;
        patch.explorer = e.data.explorer;
        patch.rpc = e.data.rpc;
        patch.engine = e.data.engine;
        patch.addr = {
          buyer: e.data.buyer, merchantA: e.data.merchantA, merchantB: e.data.merchantB,
        };
        break;
      case 'session:contracts':
        patch.contracts = { usdt: e.data.usdt, vault: e.data.vault };
        break;
      case 'deposit':
        patch.locked = e.data.locked;
        break;
      case 'session:ready':
        patch.phase = 'ready';
        patch.busy = false;
        break;
      case 'qvac:invoice':
        patch.invoiceData = e.data.invoice;
        patch.phase = 'invoiced';

        break;
      case 'voucher:signed':
        patch.voucherId = e.data.voucherId;
        patch.phase = 'signed';
        break;
      case 'merchant:accepted':
        patch.merchantA = 'accepted';
        break;
      case 'voucher:sent':
        patch.phase = 'sent';
        if (e.data.to === 'B') patch.merchantB = 'pending';
        break;
      case 'merchant:rejected':
        patch.merchantB = 'rejected';
        break;
      case 'merchant:would-accept':
        patch.merchantB = 'accepted';
        break;
      case 'redeem:confirmed':
        patch.redeemHash = e.data.hash;
        patch.redeemLink = e.data.explorer;
        patch.payout = e.data.payout;
        patch.phase = 'settled';
        break;
      case 'redeem2:reverted':
        patch.revertReason = e.data.reason;
        break;
    }

    set((s) => ({
      ...patch,
      events: [...s.events, e],
      log: LEDGER_TYPES.has(e.type) ? [...s.log, e] : s.log,
    }));
  },

  async post(path, body) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
    if (!res.ok) throw new Error(`${path} → ${res.status}`);
    return res.json();
  },

  async init() {
    if (get().busy) return;
    set({ ...initial, busy: true, phase: 'booting', _ws: get()._ws, connected: get().connected });
    try {
      await get().post('/api/session/init');
    } catch (e) {
      set({ busy: false, phase: 'idle' });
      throw e;
    }
  },

  async invoice(text) {
    set({ invoiceInput: text });
    await get().post('/api/invoice', { text });
  },
  async sign() { await get().post('/api/sign'); },
  async send(to) { await get().post('/api/send', { to }); },
  async redeem() { await get().post('/api/redeem'); },
  async redeemAgain() { await get().post('/api/redeem-again'); },

  setInvoiceInput(t) { set({ invoiceInput: t }); },

  reset() {
    set({ ...initial, _ws: get()._ws, connected: get().connected });
  },
}));
