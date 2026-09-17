import { useState } from 'react'
import { Link } from 'react-router-dom'
import { NIGERIAN_BANKS } from '../data/corridor'
import { shortId } from '../lib/format'
import {
  DEMO_RECIPIENTS,
  getRecipients,
  saveRecipient,
  type Recipient,
} from '../lib/storage'

function load(): Recipient[] {
  const existing = getRecipients()
  if (existing.length) return existing
  DEMO_RECIPIENTS.forEach(saveRecipient)
  return getRecipients()
}

export function Recipients() {
  const [recipients, setRecipients] = useState<Recipient[]>(load)
  const [form, setForm] = useState({
    name: '',
    bank: NIGERIAN_BANKS[0] as string,
    account: '',
    phone: '',
  })

  const add = () => {
    if (!form.name.trim() || !form.account.trim()) return
    const recipient: Recipient = {
      id: shortId(),
      name: form.name.trim(),
      bank: form.bank,
      account: form.account.trim(),
      phone: form.phone.trim() || undefined,
    }
    setRecipients(saveRecipient(recipient))
    setForm({ name: '', bank: NIGERIAN_BANKS[0], account: '', phone: '' })
  }

  return (
    <div className="page page-wide">
      <h1 className="page-title">Recipients</h1>
      <p className="page-sub">People you send to in Nigeria — saved on this device.</p>

      <div className="panel" style={{ marginBottom: '1.25rem' }}>
        <div className="form-grid">
          <div className="field full">
            <label htmlFor="name">Full name</label>
            <div className="field-input">
              <input
                id="name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Chinedu Eze"
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="bank">Bank / wallet</label>
            <div className="field-input">
              <select
                id="bank"
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
            <label htmlFor="account">Account number</label>
            <div className="field-input">
              <input
                id="account"
                value={form.account}
                onChange={(e) => setForm((f) => ({ ...f, account: e.target.value }))}
              />
            </div>
          </div>
          <div className="field full">
            <label htmlFor="phone">Phone</label>
            <div className="field-input">
              <input
                id="phone"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
          </div>
        </div>
        <div className="actions-row">
          <button type="button" className="btn btn-primary" onClick={add}>
            Save recipient
          </button>
          <Link to="/send" className="btn btn-ghost">
            Send money
          </Link>
        </div>
      </div>

      {recipients.length === 0 ? (
        <div className="empty">No recipients yet. Add someone above.</div>
      ) : (
        <div className="recipient-list">
          {recipients.map((r) => (
            <div key={r.id} className="recipient-item" style={{ cursor: 'default' }}>
              <div>
                <strong>{r.name}</strong>
                <span>
                  {r.bank} · {r.account}
                  {r.phone ? ` · ${r.phone}` : ''}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
