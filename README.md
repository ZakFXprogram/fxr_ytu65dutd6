# FXR OrderFlow — website

- **frontend/** — Angular 19: home, studies, pricing, install guide, account, checkout, FAQ, legal, and the owner
  panel (served only at a secret URL).
- **backend/** — NestJS (Express) + SQLite (built-in `node:sqlite`). Serves the Angular build and the API on one
  origin: one Railway service, no CORS.

## How it works

```
Member ── Sign in with Discord ──▶ /api/auth/discord        (scope "identify" only)
       ── pick a plan ──────────▶ /api/orders                (unique amount, e.g. 8.37 USDT)
       ── pays USDT (TRC20) to PAY_ADDRESS, pastes the TXID ─▶ /api/orders/:id/txid
Owner  ── opens https://site/<ADMIN_PATH>, checks the TXID on Tronscan, clicks Confirm
       ──▶ licence granted / extended
Member ── Account → "Get my licence key" (shown once) ──▶ pastes it into FXR Loader
Loader ──▶ /api/loader/auth  (key + computer id → active? bound to this computer?)
```

No payment provider, no third party: you confirm each payment in one click from the panel. The optional
`/api/webhook/paid` exists only if you plug a provider in one day (disabled while `WEBHOOK_SECRET` is empty).

## Security

**Accounts**
- Discord is the only sign-in. No passwords stored anywhere. Scope `identify` only (no e-mail, no servers).
- The Discord access token is used once to read the user id, then revoked; it is never stored.
- OAuth `state` (anti-CSRF) in a 10-minute HttpOnly cookie, single use. Return paths are restricted to this site
  (no open redirect).
- Sessions are server-side: random 256-bit id in an `HttpOnly; Secure; SameSite=Strict` cookie (`__Host-` prefix in
  production); the database stores only its SHA-256. Logout, ban or expiry ends it immediately.
  Member sessions last 7 days, owner sessions 8 hours.

**Owner panel**
- Only at `/<ADMIN_PATH>` (secret, set in Railway). The path is never in the public JavaScript: the server adds it
  to the page only at that URL. Everyone else, signed in or not, sees the normal 404 page.
- The panel API answers **404** (not 401/403) unless you hold an owner session, so it does not even confirm it exists.
  The internal `/api/admin` prefix is refused from outside.
- Owner = Discord id in `ADMIN_DISCORD_IDS` **and** Discord 2FA turned on (`ADMIN_REQUIRE_MFA=true`). Whoever steals
  your Discord password alone still cannot open the panel.
- Every action (confirm, reject, grant, revoke, ban, sign-in of the owner) is written to the activity log.

**Web**
- All state-changing API calls must come from the site's own origin (Origin check) on top of SameSite=Strict.
- Helmet: strict CSP (`script-src 'self'`, `frame-ancestors 'none'`), HSTS, `Referrer-Policy: no-referrer`,
  no `X-Powered-By`, `Cache-Control: no-store` on every API answer.
- Rate limits per IP (global + tighter on sign-in, orders, keys, loader). JSON bodies capped at 16 KB.
  Strict validation: unknown fields are rejected.

**Customer data**
- Stored: Discord id, username, display name, avatar hash; licences; orders (amount, public TXID).
- Licence keys: only SHA-256 (80-bit random keys). A key is shown once to its owner; nobody can read it back.
- Computer ids: only an HMAC with `APP_SECRET`. No IP addresses are stored.

**Payments / Tron**
- The server knows only the **public** receiving address. It holds no private key and nothing in it can move funds.
- Each order asks for a unique amount (price + unique cents): a TXID somebody saw on the public ledger cannot be
  claimed for another order, and a TXID can be attached to one order only.
- The panel checklist makes you verify on Tronscan: SUCCESS, real USDT contract
  `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` (fake "USDT" tokens exist), exact recipient, exact amount, date.

### Your checklist (outside the code — this is where most attacks happen)
1. **2FA everywhere**: Discord (required for the panel), Railway, GitHub, the e-mail behind them.
2. **Receiving wallet**: a dedicated address, ideally a hardware wallet (Ledger…). The seed phrase on paper only —
   never typed into a website, a Discord DM, a "support" chat or a file. Move funds out regularly.
3. **Address poisoning** (very common on TRON): scammers send tiny transfers from look-alike addresses so they
   appear in your history. Never copy an address from your transaction history; always from your wallet.
4. If the panel ever shows a "Customers pay to" address that is not yours, someone changed `PAY_ADDRESS`: rotate
   your Railway/GitHub credentials immediately.
5. Back up the `/data` volume (Railway → Volume → Backups).

## Deploy on Railway

1. Discord: discord.com/developers → New Application → OAuth2 → copy Client ID / Client Secret, add the redirect
   `<PUBLIC_URL>/api/auth/discord/callback`.
2. Push this folder to GitHub; create a Railway project from it (the `Dockerfile` is detected).
3. Add a **Volume** mounted at `/data`.
4. Set the variables from `.env.example`.
5. Deploy. Sign in on the site with Discord, then open `<PUBLIC_URL>/<ADMIN_PATH>`.

## Local run

```
cd frontend && npm ci && npm run build && cd ..
cd backend  && npm ci && npm run build
DISCORD_CLIENT_ID=… DISCORD_CLIENT_SECRET=… ADMIN_DISCORD_IDS=<your id> PAY_ADDRESS=T… node backend/dist/main.js
# http://localhost:8080 — add http://localhost:8080/api/auth/discord/callback as a redirect in the Discord portal
# dev panel: http://localhost:8080/panel-dev-local-only (ADMIN_PATH default in dev only)
```
