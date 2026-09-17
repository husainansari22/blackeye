import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { formatEur, formatNgn } from '../lib/format'
import { getTransfers } from '../lib/storage'

export function Activity() {
  const transfers = useMemo(() => getTransfers(), [])

  return (
    <div className="page page-wide">
      <h1 className="page-title">Activity</h1>
      <p className="page-sub">Your recent Germany → Nigeria transfers on this device.</p>

      {transfers.length === 0 ? (
        <div className="empty">
          <p style={{ margin: '0 0 1rem' }}>No transfers yet.</p>
          <Link to="/send" className="btn btn-primary">
            Send your first transfer
          </Link>
        </div>
      ) : (
        <div className="transfer-list">
          {transfers.map((t) => (
            <article key={t.id} className="transfer-row">
              <div>
                <h3>
                  {formatEur(t.amountEur)} → {formatNgn(t.receiveNgn)}
                </h3>
                <p>
                  {t.recipient.name} · {t.recipient.bank} · {t.id}
                </p>
                <p>{new Date(t.createdAt).toLocaleString('en-GB')}</p>
              </div>
              <span className={`status ${t.status}`}>{t.status}</span>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
