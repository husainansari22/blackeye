import { Link } from 'react-router-dom'
import { RateCalculator } from '../components/RateCalculator'
import { EUR_TO_NGN } from '../data/corridor'
import { formatRate } from '../lib/format'

export function Home() {
  return (
    <>
      <section className="hero">
        <div className="hero-backdrop" aria-hidden />
        <div className="hero-grid">
          <div className="hero-copy">
            <h1 className="hero-brand">
              Kudi<span>.</span>
            </h1>
            <p className="hero-headline">Send euro home to Nigeria — clear rates, fast delivery.</p>
            <p className="hero-support">
              Built for the Germany → Nigeria corridor. Bank deposit, mobile money, or cash pickup.
            </p>
            <div className="hero-actions">
              <Link to="/send" className="btn btn-gold">
                Start a transfer
              </Link>
              <a href="#how" className="btn btn-ghost" style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.35)' }}>
                How it works
              </a>
            </div>
          </div>
          <RateCalculator />
        </div>
      </section>

      <section className="section" id="how">
        <div className="section-head">
          <h2>Three steps. Money lands.</h2>
          <p>No clutter — just the path from your German account to someone you care about in Nigeria.</p>
        </div>
        <div className="feature-row">
          <article className="feature">
            <h3>1. Lock the amount</h3>
            <p>See the live EUR → NGN rate and total before you commit. Fee stays transparent.</p>
          </article>
          <article className="feature">
            <h3>2. Choose delivery</h3>
            <p>Bank account, Opay / PalmPay / Kuda, or cash pickup at partner spots.</p>
          </article>
          <article className="feature">
            <h3>3. Pay in Germany</h3>
            <p>SEPA, card, or Sofort. Most transfers arrive in minutes once funded.</p>
          </article>
        </div>
      </section>

      <section className="corridor-band">
        <div className="corridor-inner">
          <div>
            <h2>Germany to Nigeria, on purpose.</h2>
            <p>
              Kudi focuses on one corridor so rates, payout rails, and support stay sharp — not a
              hundred countries watered down.
            </p>
            <Link to="/send" className="btn btn-gold">
              Send to Nigeria
            </Link>
          </div>
          <div className="rate-chip">
            Today&apos;s rate <span>{formatRate(EUR_TO_NGN)}</span>
          </div>
        </div>
      </section>
    </>
  )
}
