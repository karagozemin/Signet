import { motion } from 'framer-motion';
import { MagneticButton } from '../components/MagneticButton';
import { SealMark } from '../components/SealMark';
import { Reveal } from '../components/Reveal';
import './landing.css';

const EASE = [0.16, 1, 0.3, 1] as const;

const PROOF_TX = '0x6776cd7dd7c2b9fc4358cf4734674663b6c950bcab796092d0f01718e37f5f21';
const VAULT = '0xa194A96F6812C153F71B2448C937BB9454ad1614';
const ETHERSCAN = 'https://sepolia.etherscan.io';

export function Landing() {
  return (
    <main className="landing">
      <header className="nav">
        <div className="nav__mark mono">SIGNET</div>
        <div className="nav__meta mono">SEPOLIA · LIVE</div>
      </header>

      {/* ── 1 · HERO ─────────────────────────────────────────── */}
      <section className="hero">
        <div className="hero__seal">
          <SealMark size={340} />
        </div>

        <div className="hero__copy">
          <motion.div
            className="eyebrow"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: EASE, delay: 0.2 }}
          >
            Offline-first stablecoin settlement
          </motion.div>

          <h1 className="display hero__title">
            {['Value,', 'sealed.'].map((word, i) => (
              <span key={word} className="hero__line">
                <motion.span
                  initial={{ y: '110%' }}
                  animate={{ y: 0 }}
                  transition={{ duration: 1.1, ease: EASE, delay: 0.3 + i * 0.12 }}
                  style={{ display: 'inline-block' }}
                >
                  {word}
                </motion.span>
              </span>
            ))}
          </h1>

          <motion.p
            className="hero__sub"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: EASE, delay: 0.7 }}
          >
            Pre-funded USDT, accepted offline over a local mesh —
            then settled on Ethereum the moment connectivity returns.
          </motion.p>

          <motion.div
            className="hero__cta"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: EASE, delay: 0.85 }}
          >
            <MagneticButton>Enter the app</MagneticButton>
            <MagneticButton variant="ghost">See the proof</MagneticButton>
          </motion.div>
        </div>

        <div className="hero__ledger mono">
          <span>deposit</span><span className="dot" /><span>sign</span>
          <span className="dot" /><span>mesh</span><span className="dot" />
          <span className="seal-word">redeem</span>
        </div>
      </section>

      {/* ── 2 · PROBLEM ──────────────────────────────────────── */}
      <section className="scene scene--problem">
        <div className="scene__inner">
          <Reveal className="eyebrow" delay={0}>The problem</Reveal>
          <Reveal as="p" className="scene__lead display" delay={0.05}>
            When the network drops, digital money dies.
          </Reveal>
          <Reveal as="p" className="scene__body" delay={0.12}>
            Cards, wallets, QR — every one of them needs a live connection to
            an issuer or a chain. A power cut, a dead cell tower, a crowded
            festival, a remote village: the moment you go dark, value stops
            moving. Cash keeps working because it needs no permission to
            change hands.
          </Reveal>
          <Reveal as="p" className="scene__accent" delay={0.18}>
            Signet gives digital stablecoins that same freedom — without
            trusting the person holding the note.
          </Reveal>
        </div>
      </section>

      {/* ── 3 · HOW IT WORKS ─────────────────────────────────── */}
      <section className="scene scene--how">
        <div className="scene__inner">
          <Reveal className="eyebrow">How it works</Reveal>
          <Reveal as="p" className="scene__lead display" delay={0.05}>
            One note, four moves.
          </Reveal>

          <ol className="journey">
            {[
              {
                k: '01', t: 'Lock',
                d: 'While online, the buyer locks USDT in an on-chain vault. That collateral is the note’s backing — it cannot be spent twice.',
              },
              {
                k: '02', t: 'Sign',
                d: 'Offline, a voucher is minted and signed against a QVAC-parsed invoice. The signature binds amount, merchant and goods together.',
              },
              {
                k: '03', t: 'Mesh',
                d: 'The signed voucher travels peer-to-peer over a local Hyperswarm mesh — no server, no internet. Merchants verify it on the spot.',
              },
              {
                k: '04', t: 'Redeem',
                d: 'When connectivity returns, the merchant redeems on Ethereum. The vault releases real USDT and marks the voucher spent forever.',
              },
            ].map((s, i) => (
              <Reveal as="li" className="journey__step" delay={0.06 * i} key={s.k}>
                <span className="journey__k mono">{s.k}</span>
                <div>
                  <h3 className="journey__t display">{s.t}</h3>
                  <p className="journey__d">{s.d}</p>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* ── 4 · DOUBLE-SPEND PEAK ────────────────────────────── */}
      <section className="scene scene--peak">
        <div className="scene__inner scene__inner--center">
          <Reveal className="eyebrow">The hard part</Reveal>
          <Reveal as="p" className="peak__line display" delay={0.05}>
            What stops the same note<br />being spent twice?
          </Reveal>
          <Reveal className="peak__grid" delay={0.14}>
            <div className="peak__card">
              <div className="peak__tag mono peak__tag--ok">MERCHANT A</div>
              <div className="peak__verdict peak__verdict--ok">ACCEPTED</div>
              <p className="peak__note">First to see the voucher. Signature valid, collateral fresh.</p>
            </div>
            <div className="peak__vs mono">vs</div>
            <div className="peak__card">
              <div className="peak__tag mono peak__tag--no">MERCHANT B</div>
              <div className="peak__verdict peak__verdict--no">REJECTED</div>
              <p className="peak__note">Same voucher, seen on the mesh. Refused before it ever touches the chain.</p>
            </div>
          </Reveal>
          <Reveal as="p" className="peak__foot" delay={0.2}>
            The mesh catches duplicates instantly. And even if a dishonest
            merchant tries anyway, the vault is the final judge —
            <span className="wax-word"> the second redeem reverts.</span>
          </Reveal>
        </div>
      </section>

      {/* ── 5 · ON-CHAIN FINALITY ────────────────────────────── */}
      <section className="scene scene--proof">
        <div className="scene__inner">
          <Reveal className="eyebrow">On-chain finality</Reveal>
          <Reveal as="p" className="scene__lead display" delay={0.05}>
            Not a demo. A real transaction.
          </Reveal>
          <Reveal as="p" className="scene__body" delay={0.12}>
            The vault and token are deployed and verified on Ethereum Sepolia.
            Every redeem in the live app produces a transaction you can open on
            Etherscan — and the double-spend attempt produces a real revert.
          </Reveal>

          <Reveal className="proof__card" delay={0.16}>
            <div className="proof__row">
              <span className="proof__label mono">VAULT</span>
              <a className="proof__val mono" href={`${ETHERSCAN}/address/${VAULT}`} target="_blank" rel="noreferrer">
                {VAULT}
              </a>
            </div>
            <div className="proof__row">
              <span className="proof__label mono">REDEEM TX</span>
              <a className="proof__val mono" href={`${ETHERSCAN}/tx/${PROOF_TX}`} target="_blank" rel="noreferrer">
                {PROOF_TX.slice(0, 22)}…{PROOF_TX.slice(-8)}
              </a>
            </div>
            <div className="proof__row">
              <span className="proof__label mono">STATUS</span>
              <span className="proof__val proof__val--ok mono">✓ CONFIRMED · VERIFIED</span>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── 6 · MANIFESTO + CTA ──────────────────────────────── */}
      <section className="scene scene--cta">
        <div className="scene__inner scene__inner--center">
          <Reveal className="cta__mark">
            <SealMark size={132} />
          </Reveal>
          <Reveal as="p" className="cta__line display" delay={0.06}>
            Value should move like cash<br />and settle like code.
          </Reveal>
          <Reveal className="cta__buttons" delay={0.14}>
            <MagneticButton>Enter the app</MagneticButton>
            <MagneticButton variant="ghost">See the proof</MagneticButton>
          </Reveal>
        </div>
        <footer className="foot mono">
          <span>SIGNET</span>
          <span>VALUE, SEALED.</span>
          <span>SEPOLIA · {new Date().getFullYear()}</span>
        </footer>
      </section>
    </main>
  );
}
