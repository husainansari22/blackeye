# Samples — kelvinoz.com website clones

Six near-identical sample sites. Company name on every site is **Samples**. Hosted only on `*.kelvinoz.com` (never `acctventa.com`).

| # | Inspired by | Live URL | Notes |
|---|-------------|----------|-------|
| 1 | blukolaservices.com | https://blukola.kelvinoz.com | Cleaning |
| 2 | households.co.za/home | https://households.kelvinoz.com | Cleaning marketplace |
| 3 | as-snowcleaningservices.com.ng | https://assnow.kelvinoz.com | Cleaning |
| 4 | elisiusrealtysolutions.netlify.app | https://elisius.kelvinoz.com | Real estate |
| 5 | awkarealestate.ng | https://awkareal.kelvinoz.com | Real estate — **All types → All states** |
| 6 | degracelandhomes.com | https://degraceland.kelvinoz.com | Real estate |

## Deploy

```bash
export HOSTINGER_API_TOKEN=…   # do not commit
python3 sample-websites/deploy.py
```

`deploy.py` allow-lists only the six subdomains above and refuses any `acctventa` target.
