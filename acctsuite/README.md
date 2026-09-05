# AcctSuite (`acctsuite.com`)

Production marketplace for buying and selling digital accounts — same product surface as Acctventa (PR #26), branded for **AcctSuite (mark A + cctsuite)**.

## Live

- Site: https://acctsuite.com/
- Owner admin: https://acctsuite.com/owner/
- Staff admin: https://acctsuite.com/admin/
- API install: https://acctsuite.com/api/install.php

## Brand

- Wordmark: **AcctSuite (mark A + cctsuite)** (logo mark `A` + `cctsuite`)
- Accent: indigo / violet (distinct from Acctventa sky blue)
- Domain: **acctsuite.com only** — never deploy to acctventa.com

## Owner admin

Full owner control panel (same capabilities as Acctventa owner):
users, listings, orders, wallets, withdrawals, KYC, commissions, support, platform settings.

Default owner login is set in `api/config.php` on the server (not committed).

## Deploy

```bash
TOKEN=... HOSTINGER_DOMAIN=acctsuite.com bash scripts/deploy-hostinger.sh /path/to/acctsuite
```

Or zip + Hostinger static/archive deploy to `acctsuite.com` public_html.

## Stack

PHP API + MySQL + static HTML/JS marketplace UI (from Acctventa PR #26, fully rebranded).
