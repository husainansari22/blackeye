# Sample websites on kelvinoz.com

Static demo sites deployed to Hostinger subdomains under **kelvinoz.com** only.

| Sample | Inspiration | Live URL |
|--------|-------------|----------|
| AceRoyal Estates | aceroyalestates.com | https://aceroyal.kelvinoz.com |
| OgaAgent (states + Buy/Rent) | ogaagent.com | https://ogaagent.kelvinoz.com |
| Delta Mega Trend | deltamegatrend.ng | https://deltamega.kelvinoz.com |
| Kada Bistro | kadabistro.com | https://kadabistro.kelvinoz.com |
| Mandela Menu | mandelamenu.com | https://mandelamenu.kelvinoz.com |
| Azure Haven Hotel (extra) | original hospitality sample | https://azurehaven.kelvinoz.com |

## Deploy

```bash
export HOSTINGER_API_TOKEN=…   # do not commit
python3 sample-websites/deploy.py
```

`deploy.py` is hard-coded to the six `*.kelvinoz.com` subdomains above and will refuse any `acctventa.com` target.
