# Kudi

Demo remittance app for the **Germany → Nigeria** corridor (EUR → NGN), inspired by products like WorldRemit and Remitly.

## Features

- Live-style EUR → NGN rate calculator
- Multi-step send flow: amount → recipient → delivery → payment → review
- Delivery options: bank deposit, mobile money, cash pickup
- Payment options: SEPA, card, Sofort
- Saved recipients & transfer activity (localStorage)

## Run

```bash
cd kudi
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

## Note

This is a frontend demo only. No real payments or licensed remittance rails are connected.
