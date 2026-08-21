# AGENTS.md

## Cursor Cloud specific instructions

### Active product scope
This repo root contains two unrelated things: (1) the legacy **BLACKEYE** phishing/OSINT CLI (`blackeye.sh`, `sites/`, and the single `localtunnel` dependency in `package.json`), and (2) **Acctventa**, a static digital‑goods marketplace web app which is the current focus of development (see the `cursor/dashboard-menu-ui-*` branch and recent commits). Do development against **Acctventa**. Do not build, run, or extend the BLACKEYE credential‑harvesting tooling.

### What Acctventa is (services & architecture)
- Pure client‑side static web app: HTML + vanilla JS + Tailwind (all via CDN). There is **no backend, no database, and no build step**. All state (users, sessions, ads, orders, wallet, admin config) lives in the browser's `localStorage`/`sessionStorage`.
- Core data/logic layer: `js/acctventa.js` (exposed as `window.Acctventa`). Dashboard UI bindings: `js/dashboard-app.js`.
- Entry points: `index.html` (landing + inline signup/login views), `dashboard.html` (user dashboard), `admin/index.html` (admin panel). `auth/*/index.html` are thin real files that JS‑redirect to `index.html?page=signup|login`, so auth routing works on any static server (Apache `.htaccess` rewrites are only for the production Hostinger/Apache host and are not required in dev).

### Running the app in dev
- Serve the repo root with any static file server, e.g. `python3 -m http.server 8000` from `/workspace`, then open `http://localhost:8000/index.html`. There is no dev-server hot reload; just refresh the browser after editing files.
- The only external network calls are CDN assets (Tailwind/Font Awesome/Google Fonts) and `https://ipapi.co/json/` (country prefix on signup). If egress is blocked the app still works but is unstyled.

### Lint / test / build
- There is **no configured linter, test suite, or build tooling** (no ESLint/Prettier/Jest/Vite config, and `package.json` has no scripts). Do not assume `npm test`/`npm run build` exist.
- For a lightweight JS syntax sanity check use `node --check js/acctventa.js` and `node --check js/dashboard-app.js`.

### Gotchas
- Deposits/withdrawals are **simulated** (no real payment gateway); a deposit pops an alert and then credits the local balance. This is expected behavior, not a bug.
- Admin panel bootstraps a default admin account `admin` / `admin123` (`ensureAdminInitialized` in `js/acctventa.js`) — used for local admin testing only.
- Because all state is in `localStorage`, to reset app data during testing clear the browser's site storage rather than looking for a server-side reset.
