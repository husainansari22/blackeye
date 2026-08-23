# KelvinOz Live

Private live studio for **kelvinoz.com**.

## Default: Free local (no Decart, no Hostinger GPU)

Runs in the visitor’s browser:

- Camera → Live Output
- Scene/background from the text prompt (free image fetch)
- Optional character photo face overlay
- OBS Browser Source at `/obs`

This is **not** Decart Lucy 2.5. Lucy is proprietary and billed by Decart. There is no free Lucy clone.

## Optional paid: Decart Lucy 2.5

Only if you add credits + `DECART_API_KEY`. Legacy client: `public/assets/studio-lucy.js` / `studio.bundle.js`.

## Environment

```bash
ACCESS_CODE=@535846.oZ
SESSION_SECRET=change-me
PORT=3000
NODE_ENV=production
# Optional only:
# DECART_API_KEY=
```

## Local run

```bash
cd kelvinoz-live
npm install
ACCESS_CODE='@535846.oZ' npm start
```

Open the site, log in with the access code, click **Start live**.
