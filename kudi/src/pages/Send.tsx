import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RateCalculator } from '../components/RateCalculator'
import {
  DELIVERY_OPTIONS,
  EUR_TO_NGN,
  NIGERIAN_BANKS,
  PAY_OPTIONS,
  calcFee,
  calcReceive,
  calcTotal,
  type DeliveryMethod,
  type PayMethod,
} from '../data/corridor'
import { formatEur, formatNgn, shortId } from '../lib/format'
import {
  DEMO_RECIPIENTS,
  getRecipients,
  saveRecipient,
  saveTransfer,
  type Recipient,
} from '../lib/storage'

const STEPS = ['Amount', 'Recipient', 'Delivery', 'Pay', 'Review'] as const

function loadAmount(): number {
  const raw = sessionStorage.getItem('kudi_amount')
  const n = raw ? Number(raw) : 200
  return Number.isFinite(n) && n > 0 ? n : 200
}

function seedRecipients(): Recipient[] {
  const existing = getRecipients()
  if (existing.length) return existing
  DEMO_RECIPIENTS.forEach(saveRecipient)
  return getRecipients()
}

export function Send() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [amount, setAmount] = useState(loadAmount)
  const [recipients, setRecipients] = useState<Recipient[]>(seedRecipients)
  const [selectedId, setSelectedId] = useState<string | null>(recipients[0]?.id ?? null)
  const [delivery, setDelivery] = useState<DeliveryMethod>('bank')
  const [payment, setPayment] = useState<PayMethod>('sepa')
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({
    name: '',
    bank: NIGERIAN_BANKS[0] as string,
    account: '',
    phone: '',
  })

  const selected = useMemo(
    () => recipients.find((r) => r.id === selectedId) ?? null,
    [recipients, selectedId],
  )

  const fee = calcFee(amount)
  const receive = calcReceive(amount)
  const total = calcTotal(amount)

  const addRecipient = () => {
    if (!form.name.trim() || !form.account.trim()) return
    const recipient: Recipient = {
      id: shortId(),
      name: form.name.trim(),
      bank: form.bank,
      account: form.account.trim(),
      phone: form.phone.trim() || undefined,
    }
    const next = saveRecipient(recipient)
    setRecipients(next)
    setSelectedId(recipient.id)
    setShowNew(false)
    setForm({ name: '', bank: NIGERIAN_BANKS[0], account: '', phone: '' })
  }

  const confirm = () => {
    if (!selected) return
    const transfer = {
      id: shortId(),
      createdAt: new Date().toISOString(),
      amountEur: amount,
      feeEur: fee,
      receiveNgn: receive,
      rate: EUR_TO_NGN,
      recipient: selected,
      delivery,
      payment,
      status: 'processing' as const,
    }
    saveTransfer(transfer)
    sessionStorage.setItem('kudi_last_transfer', transfer.id)
    setTimeout(() => {
      const list = JSON.parse(localStorage.getItem('kudi_transfers') || '[]') as typeof transfer[]
      const updated = list.map((t) =>
        t.id === transfer.id ? { ...t, status: 'delivered' as const } : t,
      )
      localStorage.setItem('kudi_transfers', JSON.stringify(updated))
    }, 4000)
    navigate(`/success/${transfer.id}`)
  }

  return (
    <div className="page">
      <h1 className="page-title">Send to Nigeria</h1>
      <p className="page-sub">Germany → Nigeria · demo transfer flow (no real money moved)</p>

      <div className="steps" role="list">
        {STEPS.map((label, i) => (
          <div
            key={label}
            role="listitem"
            className={`step-pill${i === step ? ' active' : ''}${i < step ? ' done' : ''}`}
          >
            {label}
          </div>
        ))}
      </div>

      {step === 0 && (
        <div className="panel">
          <RateCalculator
            initialAmount={amount}
            ctaLabel="Continue"
            onContinue={(value) => {
              setAmount(value)
              setStep(1)
            }}
          />
        </div>
      )}

      {step === 1 && (
        <div className="panel">
          <div className="recipient-list">
            {recipients.map((r) => (
              <button
                key={r.id}
                type="button"
                className={`recipient-item${selectedId === r.id ? ' selected' : ''}`}
                onClick={() => setSelectedId(r.id)}
              >
                <div>
                  <strong>{r.name}</strong>
                  <span>
                    {r.bank} · {r.account}
                  </span>
                </div>
              </button>
            ))}
          </div>

          {!showNew ? (
            <button type="button" className="btn btn-ghost btn-block" onClick={() => setShowNew(true)}>
              + Add new recipient
            </button>
          ) : (
            <div className="form-grid" style={{ marginTop: '0.5rem' }}>
              <div className="field full">
                <label htmlFor="r-name">Full name</label>
                <div className="field-input">
                  <input
                    id="r-name"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Adaeze Okonkwo"
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="r-bank">Bank / wallet</label>
                <div className="field-input">
                  <select
                    id="r-bank"
                    value={form.bank}
                    onChange={(e) => setForm((f) => ({ ...f, bank: e.target.value }))}
                  >
                    {NIGERIAN_BANKS.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="field">
                <label htmlFor="r-account">Account / phone</label>
                <div className="field-input">
                  <input
                    id="r-account"
                    value={form.account}
                    onChange={(e) => setForm((f) => ({ ...f, account: e.target.value }))}
                    placeholder="0123456789"
                  />
                </div>
              </div>
              <div className="field full">
                <label htmlFor="r-phone">Phone (optional)</label>
                <div className="field-input">
                  <input
                    id="r-phone"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="+234 ..."
                  />
                </div>
              </div>
              <div className="actions-row full">
                <button type="button" className="btn btn-ghost" onClick={() => setShowNew(false)}>
                  Cancel
                </button>
                <button type="button" className="btn btn-primary" onClick={addRecipient}>
                  Save recipient
                </button>
              </div>
            </div>
          )}

          <div className="actions-row">
            <button type="button" className="btn btn-ghost" onClick={() => setStep(0)}>
              Back
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!selected}
              onClick={() => setStep(2)}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="panel">
          <div className="option-grid">
            {DELIVERY_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`option${delivery === opt.id ? ' selected' : ''}`}
                onClick={() => setDelivery(opt.id)}
              >
                <strong>{opt.title}</strong>
                <span>{opt.detail}</span>
                <em>{opt.eta}</em>
              </button>
            ))}
          </div>
          <div className="actions-row">
            <button type="button" className="btn btn-ghost" onClick={() => setStep(1)}>
              Back
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setStep(3)}>
              Continue
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="panel">
          <div className="option-grid">
            {PAY_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`option${payment === opt.id ? ' selected' : ''}`}
                onClick={() => setPayment(opt.id)}
              >
                <strong>{opt.title}</strong>
                <span>{opt.detail}</span>
              </button>
            ))}
          </div>
          <div className="actions-row">
            <button type="button" className="btn btn-ghost" onClick={() => setStep(2)}>
              Back
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setStep(4)}>
              Continue
            </button>
          </div>
        </div>
      )}

      {step === 4 && selected && (
        <div className="panel">
          <div className="summary-list">
            <div>
              <span>You send</span>
              <strong>{formatEur(amount)}</strong>
            </div>
            <div>
              <span>Fee</span>
              <strong>{formatEur(fee)}</strong>
            </div>
            <div>
              <span>Recipient gets</span>
              <strong>{formatNgn(receive)}</strong>
            </div>
            <div>
              <span>To</span>
              <strong>
                {selected.name} · {selected.bank}
              </strong>
            </div>
            <div>
              <span>Delivery</span>
              <strong>{DELIVERY_OPTIONS.find((d) => d.id === delivery)?.title}</strong>
            </div>
            <div>
              <span>Pay with</span>
              <strong>{PAY_OPTIONS.find((p) => p.id === payment)?.title}</strong>
            </div>
            <div>
              <span>Total debit</span>
              <strong>{formatEur(total)}</strong>
            </div>
          </div>
          <div className="actions-row">
            <button type="button" className="btn btn-ghost" onClick={() => setStep(3)}>
              Back
            </button>
            <button type="button" className="btn btn-gold" onClick={confirm}>
              Confirm &amp; send
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
