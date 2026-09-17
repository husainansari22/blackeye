export const EUR_TO_NGN = 1684.52
export const FEE_PERCENT = 0.009
export const FEE_FLAT_EUR = 0.99
export const MIN_SEND_EUR = 10
export const MAX_SEND_EUR = 10000

export const NIGERIAN_BANKS = [
  'Access Bank',
  'GTBank',
  'Zenith Bank',
  'First Bank',
  'UBA',
  'Stanbic IBTC',
  'Fidelity Bank',
  'Opay',
  'PalmPay',
  'Kuda',
] as const

export type DeliveryMethod = 'bank' | 'mobile' | 'cash'
export type PayMethod = 'sepa' | 'card' | 'sofort'

export const DELIVERY_OPTIONS: {
  id: DeliveryMethod
  title: string
  detail: string
  eta: string
}[] = [
  {
    id: 'bank',
    title: 'Bank deposit',
    detail: 'Straight into a Nigerian bank account',
    eta: 'Usually minutes',
  },
  {
    id: 'mobile',
    title: 'Mobile money',
    detail: 'Opay, PalmPay, Kuda & more',
    eta: 'Instant',
  },
  {
    id: 'cash',
    title: 'Cash pickup',
    detail: 'Collect at partner locations in Nigeria',
    eta: 'Within 1 hour',
  },
]

export const PAY_OPTIONS: {
  id: PayMethod
  title: string
  detail: string
}[] = [
  {
    id: 'sepa',
    title: 'SEPA bank transfer',
    detail: 'Pay from your German bank account',
  },
  {
    id: 'card',
    title: 'Debit or credit card',
    detail: 'Visa, Mastercard — instant debit',
  },
  {
    id: 'sofort',
    title: 'Sofort / Klarna',
    detail: 'Pay securely via your online banking',
  },
]

export function calcFee(amountEur: number): number {
  if (!amountEur || amountEur <= 0) return 0
  return Math.round((amountEur * FEE_PERCENT + FEE_FLAT_EUR) * 100) / 100
}

export function calcReceive(amountEur: number): number {
  if (!amountEur || amountEur <= 0) return 0
  return Math.round(amountEur * EUR_TO_NGN)
}

export function calcTotal(amountEur: number): number {
  return Math.round((amountEur + calcFee(amountEur)) * 100) / 100
}
