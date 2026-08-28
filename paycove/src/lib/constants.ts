export const PLATFORM_NAME = "PayCove";
export const PLATFORM_TAGLINE = "Pay safe. Pay now.";
export const PLATFORM_DOMAIN = "paycovenow.com";
export const FEE_PERCENT = 4;

export const DEAL_TYPES = {
  GOODS: {
    id: "GOODS",
    label: "Shop & IG Goods",
    description: "Fashion, gadgets, wigs, sneakers — anything sold on WhatsApp or Instagram.",
    icon: "🛍️",
  },
  VERIFY: {
    id: "VERIFY",
    label: "Payment Verify",
    description: "Confirm payment is real before you ship. No full hold required.",
    icon: "✅",
  },
  SERVICE: {
    id: "SERVICE",
    label: "Services",
    description: "Tailors, plumbers, designers — pay when the job is done.",
    icon: "🔧",
  },
  HIGH_TICKET: {
    id: "HIGH_TICKET",
    label: "High-Ticket",
    description: "Cars, phones, electronics — big deals need big trust.",
    icon: "🚗",
  },
  RENT: {
    id: "RENT",
    label: "Rent & Deposits",
    description: "Hold rent and deposits until keys are handed over.",
    icon: "🏠",
  },
  EVENT: {
    id: "EVENT",
    label: "Events & Weddings",
    description: "Pay vendors in milestones — caterer, photographer, decorator.",
    icon: "💒",
  },
  IMPORT: {
    id: "IMPORT",
    label: "Import & Freight",
    description: "Release payment when your goods land in Nigeria.",
    icon: "📦",
  },
  B2B: {
    id: "B2B",
    label: "B2B Supply",
    description: "Shop owners paying suppliers — delivery proof required.",
    icon: "🏪",
  },
} as const;

export type DealTypeId = keyof typeof DEAL_TYPES;

export const DEAL_STATUSES = {
  PENDING_PAYMENT: "Awaiting payment",
  PAID: "Paid — held in escrow",
  IN_PROGRESS: "In progress",
  SHIPPED: "Shipped / proof uploaded",
  DELIVERED: "Delivered — awaiting confirmation",
  RELEASED: "Completed — funds released",
  DISPUTED: "Dispute open",
  REFUNDED: "Refunded to buyer",
  CANCELLED: "Cancelled",
} as const;
