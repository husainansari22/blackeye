import type { DeliveryMethod, PayMethod } from '../data/corridor'

export type Recipient = {
  id: string
  name: string
  bank: string
  account: string
  phone?: string
}

export type Transfer = {
  id: string
  createdAt: string
  amountEur: number
  feeEur: number
  receiveNgn: number
  rate: number
  recipient: Recipient
  delivery: DeliveryMethod
  payment: PayMethod
  status: 'processing' | 'delivered' | 'failed'
}

const RECIPIENTS_KEY = 'kudi_recipients'
const TRANSFERS_KEY = 'kudi_transfers'

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function write<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value))
}

export function getRecipients(): Recipient[] {
  return read<Recipient[]>(RECIPIENTS_KEY, [])
}

export function saveRecipient(recipient: Recipient): Recipient[] {
  const list = getRecipients()
  const next = [recipient, ...list.filter((r) => r.id !== recipient.id)]
  write(RECIPIENTS_KEY, next)
  return next
}

export function getTransfers(): Transfer[] {
  return read<Transfer[]>(TRANSFERS_KEY, [])
}

export function saveTransfer(transfer: Transfer): Transfer[] {
  const list = getTransfers()
  const next = [transfer, ...list]
  write(TRANSFERS_KEY, next)
  return next
}

export const DEMO_RECIPIENTS: Recipient[] = [
  {
    id: 'demo-1',
    name: 'Adaeze Okonkwo',
    bank: 'GTBank',
    account: '0123456789',
    phone: '+234 803 000 1122',
  },
  {
    id: 'demo-2',
    name: 'Chinedu Eze',
    bank: 'Opay',
    account: '08031112233',
    phone: '+234 803 111 2233',
  },
]
