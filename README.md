# Acctventa

Marketplace for digital accounts and products — https://acctventa.com

## Stack

- PHP API (`api/`) + MySQL
- Static dashboard UI (`dashboard.html`, `js/`, `css/`)
- Owner admin (`owner/index.php`) and staff admin (`admin/`)

## Local notes

Copy `api/config.example.php` → `api/config.php` and set DB credentials.

Deploy with:

```bash
TOKEN=… ./scripts/deploy-hostinger.sh /workspace
```

Only the Acctventa marketplace files belong in this repository.
