import { Link, useParams } from 'react-router-dom'
import { DELIVERY_OPTIONS } from '../data/corridor'
import { formatEur, formatNgn } from '../lib/format'
import { getTransfers } from '../lib/storage'

export function Success() {
  const { id } = useParams()
  const transfer = getTransfers().find((t) => t.id === id)

  if (!transfer) {
    return (
      <div className="page">
        <div className="empty">
          <p style={{ margin: '0 0 1rem' }}>Transfer not found.</p>
          <Link to="/activity" className="btn btn-primary">
            View activity
          </Link>
        </div>
      </div>
    )
  }

  const delivery = DELIVERY_OPTIONS.find((d) => d.id === transfer.delivery)?.title

  return (
    <div className="page">
      <div className="success-hero">
        <div className="check" aria-hidden>
          ✓
        </div>
        <h1>On its way to Nigeria</h1>
        <p>
          {formatEur(transfer.amountEur)} is headed to {transfer.recipient.name}. They&apos;ll
          receive {formatNgn(transfer.receiveNgn)} via {delivery?.toLowerCase()}.
        </p>
        <p style={{ fontWeight: 700, color: 'var(--forest)' }}>Reference {transfer.id}</p>
        <div className="hero-actions" style={{ justifyContent: 'center' }}>
          <Link to="/activity" className="btn btn-primary">
            Track activity
          </Link>
          <Link to="/send" className="btn btn-ghost">
            Send again
          </Link>
        </div>
      </div>
    </div>
  )
}
