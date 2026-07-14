import { motion } from 'framer-motion';
import { MagneticButton } from '../components/MagneticButton';
import { SealMark } from '../components/SealMark';
import './landing.css';

const EASE = [0.16, 1, 0.3, 1] as const;

export function Landing() {
  return (
    <main className="landing">
      <header className="nav">
        <div className="nav__mark mono">SIGNET</div>
        <div className="nav__meta mono">SEPOLIA · LIVE</div>
      </header>

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
    </main>
  );
}