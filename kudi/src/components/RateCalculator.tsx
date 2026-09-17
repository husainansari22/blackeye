import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  EUR_TO_NGN,
  MAX_SEND_EUR,
  MIN_SEND_EUR,
  calcFee,
  calcReceive,
  calcTotal,
} from '../data/corridor'
import { formatEur, formatNgn, formatRate } from '../lib/format'

type Props = {
  initialAmount?: number
  ctaTo?: string
  ctaLabel?: string
  onContinue?: (amount: number) => void
}

export function RateCalculator({
  initialAmount = 200,
  ctaTo = '/send',
  ctaLabel = 'Continue to send',
  onContinue,
}: Props) {
  const [amount, setAmount] = useState(String(initialAmount))

  const amountNum = Number(amount) || 0
  const fee = useMemo(() => calcFee(amountNum), [amountNum])
  const receive = useMemo(() => calcReceive(amountNum), [amountNum])
  const total = useMemo(() => calcTotal(amountNum), [amountNum])
  const valid = amountNum >= MIN_SEND_EUR && amountNum <= MAX_SEND_EUR

  const handleContinue = () => {
    if (!valid) return
    sessionStorage.setItem('kudi_amount', String(amountNum))
    onContinue?.(amountNum)
  }

  return (
    <div className="calculator">
      <div className="calc-route">
        <div className="route-side">
          <strong>Germany</strong>
          <span>You send EUR</span>
        </div>
        <div className="route-arrow" aria-hidden>
          →
        </div>
        <div className="route-side" style={{ textAlign: 'right' }}>
          <strong>Nigeria</strong>
          <span>They get NGN</span>
        </div>
      </div>

      <div className="field">
        <label htmlFor="send-amount">You send</label>
        <div className="field-input">
          <span className="field-prefix">EUR</span>
          <input
            id="send-amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => {
              const next = e.target.value.replace(/[^0-9.]/g, '')
              setAmount(next)
            }}
            aria-label="Amount in euro"
          />
        </div>
      </div>

      <div className="receive-box">
        <div className="label">Recipient gets</div>
        <div className="amount" key={receive}>
          {formatNgn(receive)}
        </div>
      </div>

      <div className="calc-meta">
        <div>
          <span>Exchange rate</span>
          <strong>{formatRate(EUR_TO_NGN)}</strong>
        </div>
        <div>
          <span>Transfer fee</span>
          <strong>{formatEur(fee)}</strong>
        </div>
        <div>
          <span>Total to pay</span>
          <strong>{formatEur(total)}</strong>
        </div>
      </div>

      {!valid && amountNum > 0 && (
        <p style={{ color: 'var(--danger)', fontSize: '0.88rem', margin: '0 0 0.85rem' }}>
          Send between {formatEur(MIN_SEND_EUR)} and {formatEur(MAX_SEND_EUR)}.
        </p>
      )}

      {onContinue ? (
        <button
          type="button"
          className="btn btn-gold btn-block"
          disabled={!valid}
          onClick={handleContinue}
        >
          {ctaLabel}
        </button>
      ) : (
        <Link
          to={ctaTo}
          className={`btn btn-gold btn-block${!valid ? ' disabled' : ''}`}
          style={!valid ? { pointerEvents: 'none', opacity: 0.45 } : undefined}
          onClick={handleContinue}
        >
          {ctaLabel}
        </Link>
      )}
    </div>
  )
}
