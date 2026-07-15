import { Link } from 'react-router-dom';
import { Reveal } from '../components/Reveal';
import { SealMark } from '../components/SealMark';
import './proof.css';

const ETHERSCAN = 'https://sepolia.etherscan.io';
const VAULT = '0xa194A96F6812C153F71B2448C937BB9454ad1614';
const USDT = '0x509e7C1758ba12C6907f93D4ee6458b6DEB8353C';
const REDEEM_TX = '0x6776cd7dd7c2b9fc4358cf4734674663b6c950bcab796092d0f01718e37f5f21';
const DEPLOYER = '0x122C07D5654ceFE0Ae41E2A45A2845F20263dA5D';

function Row({ label, value, href, note }: { label: string; value: string; href?: string; note?: string }) {
  return (
    <div className="prow">
      <span className="prow__label mono">{label}</span>
      <div className="prow__val">
        {href
          ? <a className="mono" href={href} target="_blank" rel="noreferrer">{value}</a>
          : <span className="mono">{value}</span>}
        {note && <span className="prow__note">{note}</span>}
      </div>
    </div>
  );
}

export function Proof() {
  return (
    <main className="proof">
      <header className="thead">
        <Link to="/" className="thead__back mono">← SIGNET</Link>
        <div className="thead__status mono">on-chain proof · sepolia</div>
        <Link to="/app" className="thead__proof mono">APP →</Link>
      </header>

      <section className="proof__hero">
        <Reveal className="proof__seal"><SealMark size={120} /></Reveal>
        <Reveal as="h1" className="display proof__title" delay={0.05}>
          Verify it yourself.
        </Reveal>
        <Reveal as="p" className="proof__sub" delay={0.1}>
          Signet is not a mockup. The contracts are live and verified on
          Ethereum Sepolia; the settlement below is a real transaction anyone
          can inspect on Etherscan.
        </Reveal>
      </section>

      <Reveal className="proof__block" delay={0.06}>
        <h2 className="proof__h mono">CONTRACTS · VERIFIED</h2>
        <Row label="VOUCHER VAULT" value={VAULT} href={`${ETHERSCAN}/address/${VAULT}#code`} note="holds collateral · final double-spend judge" />
        <Row label="MOCK USDT" value={USDT} href={`${ETHERSCAN}/address/${USDT}#code`} note="6-decimal ERC-20 test token" />
        <Row label="DEPLOYER" value={DEPLOYER} href={`${ETHERSCAN}/address/${DEPLOYER}`} />
      </Reveal>

      <Reveal className="proof__block" delay={0.1}>
        <h2 className="proof__h mono">SETTLEMENT · CONFIRMED</h2>
        <Row label="REDEEM TX" value={REDEEM_TX} href={`${ETHERSCAN}/tx/${REDEEM_TX}`} note="real USDT released to the merchant" />
        <Row label="DOUBLE-SPEND" value="reverts on second redeem" note="spent[voucherId] is the final arbiter" />
      </Reveal>

      <Reveal className="proof__cta" delay={0.12}>
        <p className="proof__ctaline display">See it happen live, end to end.</p>
        <Link to="/app" className="mag-btn mag-btn--solid"><span>Open the live theatre</span></Link>
      </Reveal>

      <footer className="foot mono">
        <span>SIGNET</span><span>VALUE, SEALED.</span><span>SEPOLIA · {new Date().getFullYear()}</span>
      </footer>
    </main>
  );
}
