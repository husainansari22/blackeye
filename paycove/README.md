# PayCove

**Pay safe. Pay now.** — Nigeria's all-in-one escrow platform at [paycovenow.com](https://paycovenow.com).

PayCove protects deals across WhatsApp & IG commerce, services, rent, high-ticket items, events, imports, and B2B supply. Sellers create payment links; buyers pay via Paystack; funds are held until delivery is confirmed.

## Features

- All deal types on one platform (goods, verify, services, rent, cars, events, import, B2B)
- Seller dashboard with payment link generation
- Buyer payment pages (mobile-friendly, no app required)
- 4% platform fee per deal
- Escrow flow: pay → ship/prove → confirm → release
- Dispute handling
- Admin overview panel
- Paystack integration (with mock mode for local dev)

## Tech stack

- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS
- Prisma + SQLite (swap to PostgreSQL for production)
- Paystack
- JWT session cookies

## Quick start

```bash
cd paycove
cp .env.example .env
npm install
npx prisma migrate dev
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Demo accounts (after seed)

| Email | Password | Role |
|-------|----------|------|
| seller@paycovenow.com | PayCove2026! | Seller |
| admin@paycovenow.com | PayCove2026! | Admin |

## Paystack setup

1. Create a [Paystack](https://paystack.com) account
2. Add your test/live keys to `.env`
3. Set `NEXT_PUBLIC_APP_URL` to your deployed URL for callbacks

Without Paystack keys, the app runs in **mock payment mode** for local testing.

## Deal flow

1. Seller registers and creates a deal
2. Seller shares `/pay/{dealId}` link on WhatsApp or Instagram
3. Buyer pays through Paystack
4. Seller uploads delivery proof
5. Buyer confirms or opens dispute
6. Funds released to seller (minus 4% fee)

## Production notes

- Switch `DATABASE_URL` to PostgreSQL
- Set strong `AUTH_SECRET`
- Configure Paystack webhooks for production reliability
- Add bank transfer / subaccount logic for seller payouts
- Register business with CAC and comply with Nigerian fintech regulations

## License

Private — PayCove / paycovenow.com
