import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useSession, type Phase } from '../store/session';
import './theatre.css';

const EASE = [0.16, 1, 0.3, 1] as const;

function short(a?: string | null) {
  if (!a) return '—';
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

/**
 * A reference to something real on-chain. Renders a short mono hash and, when a
 * public explorer exists (i.e. we're on Sepolia, not local anvil), links out to
 * it. Addresses → /address, transactions → /tx. Off-chain ids (like a voucher
 * note) are NOT on-chain, so they stay as plain text.
 */
function ChainRef({
  value, kind, explorer, className = 'mono',
}: {
  value?: string | null;
  kind: 'address' | 'tx';
  explorer: string | null;
  className?: string;
}) {
  if (!value) return <span className={className}>—</span>;
  if (!explorer) return <span className={className} title={value}>{short(value)}</span>;
  const href = `${explorer}/${kind === 'tx' ? 'tx' : 'address'}/${value}`;
  return (
    <a className={`cref ${className}`} href={href} target="_blank" rel="noreferrer" title={`${value} — open on explorer`}>
      {short(value)}
    </a>
  );
}


const PHASE_LABEL: Record<Phase, string> = {
  idle: 'Not started',
  booting: 'Booting session…',
  ready: 'Ready — vault funded',
  invoiced: 'Invoice parsed',
  signed: 'Voucher signed',
  sent: 'On the mesh',
  settled: 'Settled on-chain',
};

// human line for each ledger event
function ledgerLine(type: string, data: any): { text: string; tone?: string } {
  switch (type) {
    case 'log': return { text: data.msg };
    case 'session:chain': return { text: `chain ${data.chainId} · ${data.local ? 'local anvil' : 'live'} · engine ${data.engine}` };
    case 'session:contracts': return { text: `contracts deployed · vault ${short(data.vault)}` };
    case 'deposit': return { text: `buyer locked ${data.locked} USDT in vault`, tone: 'brass' };
    case 'mesh:connected': return { text: `mesh up · A:${data.a} peers · B:${data.b} peers` };
    case 'session:ready': return { text: 'session ready', tone: 'ok' };
    case 'qvac:invoice': return { text: `QVAC parsed "${data.input}" → ${data.invoice.total} ${data.invoice.currency}` };
    case 'voucher:signed': return { text: `voucher signed ${short(data.voucherId)} · ${data.denom} USDT`, tone: 'brass' };
    case 'voucher:sent': return { text: `voucher sent to Merchant ${data.to}` };
    case 'merchant:accepted': return { text: `Merchant ${data.by} ACCEPTED · signature valid`, tone: 'ok' };
    case 'merchant:invalid': return { text: `Merchant ${data.by} rejected · bad signature`, tone: 'no' };
    case 'merchant:rejected': return { text: `Merchant ${data.by} REJECTED · duplicate on mesh`, tone: 'no' };
    case 'merchant:would-accept': return { text: `Merchant ${data.by} would accept` };
    case 'redeem:pending': return { text: 'redeem submitted to chain…' };
    case 'redeem:confirmed': return { text: `redeem confirmed · +${data.payout} USDT · ${short(data.hash)}`, tone: 'ok' };
    case 'redeem2:pending': return { text: 'attempting second redeem…' };
    case 'redeem2:reverted': return { text: `second redeem REVERTED · ${data.reason}`, tone: 'no' };
    case 'redeem2:unexpected': return { text: 'second redeem unexpectedly succeeded', tone: 'no' };
    case 'error': return { text: `error · ${data.msg}`, tone: 'no' };
    default: return { text: type };
  }
}

function VerdictBadge({ v }: { v: string }) {
  const map: Record<string, { t: string; c: string }> = {
    idle: { t: 'waiting', c: 'idle' },
    pending: { t: 'seen…', c: 'pending' },
    accepted: { t: 'ACCEPTED', c: 'ok' },
    rejected: { t: 'REJECTED', c: 'no' },
  };
  const m = map[v] ?? map.idle;
  return <span className={`verdict verdict--${m.c}`}>{m.t}</span>;
}

export function AppTheatre() {
  const s = useSession();
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    s.connect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [s.log.length]);

  const started = s.phase !== 'idle' && s.phase !== 'booting';
  const canInvoice = started;
  const canSign = ['invoiced', 'signed', 'sent', 'settled'].includes(s.phase);
  const canSend = ['signed', 'sent', 'settled'].includes(s.phase);
  const canRedeem = s.merchantA === 'accepted';
  const settled = s.phase === 'settled';

  return (
    <main className="theatre">
      <header className="thead">
        <Link to="/" className="thead__back mono">← SIGNET</Link>
        <div className="thead__status mono">
          <span className={`beacon ${s.connected ? 'beacon--on' : ''}`} />
          {s.connected ? 'bridge connected' : 'connecting…'}
          <span className="thead__sep">·</span>
          {s.chainId ? (s.local ? `anvil ${s.chainId}` : `chain ${s.chainId}`) : 'no chain'}
          <span className="thead__sep">·</span>
          {PHASE_LABEL[s.phase]}
        </div>
        <Link to="/proof" className="thead__proof mono">PROOF →</Link>
      </header>

      {/* Boot gate */}
      {!started && (
        <div className="boot">
          <div className="boot__inner">
            <h1 className="display boot__title">The live theatre</h1>
            <p className="boot__sub">
              This spins up real mesh peers, deploys real contracts, and locks real
              collateral. Every line below is an actual event — nothing is faked.
            </p>
            <button
              className="mag-btn mag-btn--solid boot__btn"
              disabled={s.phase === 'booting'}
              onClick={() => s.init()}
            >
              <span>{s.phase === 'booting' ? 'Booting…' : 'Boot the session'}</span>
            </button>
            {s.phase === 'booting' && (
              <p className="boot__hint mono">deploying contracts + joining mesh… ~10–20s</p>
            )}
          </div>
        </div>
      )}

      {started && (
        <div className="stage">
          {/* ── PANEL 1 · BUYER ──────────────────────────── */}
          <section className="panel">
            <div className="panel__head">
              <span className="panel__no mono">01</span>
              <h2 className="panel__title display">Buyer</h2>
              <ChainRef className="panel__addr mono" value={s.addr.buyer} kind="address" explorer={s.explorer} />

            </div>

            <div className="vault">
              <div className="vault__num display">{s.locked ?? '—'}</div>
              <div className="vault__label mono">USDT LOCKED</div>
            </div>

            <label className="field">
              <span className="field__label mono">INVOICE (natural language)</span>
              <input
                className="field__input mono"
                value={s.invoiceInput}
                onChange={(e) => s.setInvoiceInput(e.target.value)}
                disabled={!canInvoice}
              />
            </label>

            {s.invoiceData && (
              <div className="inv">
                {s.invoiceData.items?.map((it: any, i: number) => (
                  <div className="inv__row mono" key={i}>
                    <span>{it.quantity}× {it.name}</span>
                    <span>{it.price} {s.invoiceData.currency}</span>
                  </div>
                ))}
                <div className="inv__row inv__row--total mono">
                  <span>TOTAL</span>
                  <span>{s.invoiceData.total} {s.invoiceData.currency}</span>
                </div>
              </div>
            )}

            <div className="acts">
              <button className="act act--parse" disabled={!canInvoice} onClick={() => s.invoice(s.invoiceInput)}>
                <svg className="act__ico" viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden>
                  <rect x="3" y="2" width="10" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
                  <line className="ic-scan" x1="4.5" y1="8" x2="11.5" y2="8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
                <span>Parse invoice (QVAC)</span>
              </button>
              <button className="act act--sign" disabled={!canSign} onClick={() => s.sign()}>
                <svg className="act__ico" viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden>
                  <path className="ic-ink" d="M2 12 Q5 5 8 9.5 T14 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" pathLength={1} />
                </svg>
                <span>Sign voucher</span>
              </button>
            </div>


            {s.voucherId && (
              <AnimatePresence>
                <motion.div
                  className="voucher"
                  initial={{ opacity: 0, y: 14, rotate: -1 }}
                  animate={{ opacity: 1, y: 0, rotate: 0 }}
                  transition={{ duration: 0.7, ease: EASE }}
                >
                  <div className="voucher__seal" />
                  <div className="voucher__body">
                    <div className="voucher__amt display">1.00 <span>USDT</span></div>
                    <div className="voucher__id mono">{short(s.voucherId)}</div>
                    <div className="voucher__meta mono">SIGNED · BEARER NOTE</div>
                  </div>
                </motion.div>
              </AnimatePresence>
            )}
          </section>

          {/* ── PANEL 2 · MESH ───────────────────────────── */}
          <section className="panel panel--mesh">
            <div className="panel__head">
              <span className="panel__no mono">02</span>
              <h2 className="panel__title display">Mesh</h2>
              <span className="panel__addr mono">offline · P2P</span>
            </div>

            <p className="mesh__hint">
              Send the signed voucher to a merchant over the local mesh. Then try
              the <em>same</em> voucher on the other — watch the duplicate get caught.
            </p>

            <div className="acts acts--col">
              <button className="act act--wax act--send" disabled={!canSend} onClick={() => s.send('A')}>
                <span>Send to Merchant A</span>
                <svg className="act__ico act__ico--send" viewBox="0 0 18 12" width="18" height="12" fill="none" aria-hidden>
                  <line x1="1" y1="6" x2="13" y2="6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  <path d="M11 2.5 L15.5 6 L11 9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button className="act act--ghost act--dupe" disabled={!canSend} onClick={() => s.send('B')}>
                <svg className="act__ico act__ico--dupe" viewBox="0 0 16 14" width="16" height="14" fill="none" aria-hidden>
                  <path d="M3 2 V6 Q3 8 5 8 H13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M3 12 V6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  <path d="M11 6 L13 8 L11 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>Double-spend → Merchant B</span>
              </button>
            </div>


            <div className="merchants">
              <div className="merchant">
                <div className="merchant__id mono">
                  MERCHANT A · <ChainRef value={s.addr.merchantA} kind="address" explorer={s.explorer} />
                </div>
                <VerdictBadge v={s.merchantA} />
              </div>
              <div className="merchant">
                <div className="merchant__id mono">
                  MERCHANT B · <ChainRef value={s.addr.merchantB} kind="address" explorer={s.explorer} />
                </div>
                <VerdictBadge v={s.merchantB} />
              </div>

            </div>
          </section>

          {/* ── PANEL 3 · CHAIN ──────────────────────────── */}
          <section className="panel panel--chain">
            <div className="panel__head">
              <span className="panel__no mono">03</span>
              <h2 className="panel__title display">Chain</h2>
              <span className="panel__addr mono">{short(s.contracts.vault)}</span>
            </div>

            <p className="mesh__hint">
              Connectivity returns. Merchant A redeems the accepted voucher on-chain —
              real USDT moves. A second redeem of the same note must revert.
            </p>

            <div className="acts acts--col">
              <button className="act act--wax act--redeem" disabled={!canRedeem || settled} onClick={() => s.redeem()}>
                <svg className="act__ico act__ico--redeem" viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden>
                  <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
                  <path className="ic-check" d="M5 8.2 L7.2 10.4 L11 5.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" pathLength={1} />
                </svg>
                <span>Redeem on-chain</span>
              </button>
              <button className="act act--ghost act--again" disabled={!settled} onClick={() => s.redeemAgain()}>
                <svg className="act__ico act__ico--again" viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden>
                  <rect x="3.5" y="7" width="9" height="6.5" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M5.5 7 V5 A2.5 2.5 0 0 1 10.5 5 V7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
                <span>Try to redeem again</span>
              </button>
            </div>


            {s.redeemHash && (
              <motion.div
                className="settle"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: EASE }}
              >
                <div className="settle__row mono">
                  <span>PAID OUT</span><span className="settle__ok">+{s.payout} USDT</span>
                </div>
                <div className="settle__row mono">
                  <span>TX</span>
                  {s.redeemLink
                    ? <a href={s.redeemLink} target="_blank" rel="noreferrer">{short(s.redeemHash)}</a>
                    : <span>{short(s.redeemHash)}</span>}
                </div>
                {s.revertReason && (
                  <div className="settle__row settle__row--revert mono">
                    <span>2ND REDEEM</span><span className="settle__no">REVERTED · {s.revertReason}</span>
                  </div>
                )}
              </motion.div>
            )}
          </section>
        </div>
      )}

      {/* ── LIVE LEDGER ─────────────────────────────────── */}
      {started && (
        <section className="ledger">
          <div className="ledger__head mono">LIVE LEDGER · {s.log.length} EVENTS</div>
          <div className="ledger__body" ref={logRef}>
            {s.log.map((e, i) => {
              const l = ledgerLine(e.type, e.data);
              return (
                <div className={`ledger__line mono ${l.tone ? `t-${l.tone}` : ''}`} key={i}>
                  <span className="ledger__t">{new Date(e.t).toLocaleTimeString()}</span>
                  <span className="ledger__type">{e.type}</span>
                  <span className="ledger__msg">{l.text}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}
