# FXR OrderFlow — website

- **frontend/** — Angular 19: animated public site (studies, study pages, pricing, install, FAQ, legal with risk
  disclosure), checkout, member dashboard (overview, billing, licence, redeem a key, security) and the owner panel
  (served only at a secret URL).
- **backend/** — NestJS (Express) + SQLite (built-in `node:sqlite`). Serves the Angular build and the API on one
  origin: one Railway service, no CORS.

## How it works

```
Visitor  ── browses studies & pricing (no account needed)
Member   ── Sign in with Discord (scope "identify") ──▶ /buy/<plan>: accepts Terms + Risk disclosure
         ── /checkout/<order>: exact amount (e.g. 8.0037 USDT), your TRON address + QR, 30-minute timer
         ── sends USDT (TRC20) from any wallet or exchange, straight to YOUR wallet
Site     ── watcher reads the TRON blockchain (index + confirmed node), matches the exact amount ──▶ licence
Site     ── adds the Discord member role (bot) ──▶ member opens the install channel, gets the loader + guide
Member   ── Dashboard → Licence → key (shown once) ──▶ FXR Loader ──▶ /api/loader/auth
Owner    ── https://site/<ADMIN_PATH>: overview, orders, payments received, members, licences, keys, activity
```

## Payments: direct to your wallet, no provider

No payment company sits in the middle: buyers pay your own TRON address and the server only **reads** the public
blockchain. It never holds a private key or seed, so it cannot move funds, and there is no fee on your side.

- Each order asks for the price plus a unique `0.0001-0.0999` USDT (`8.0037`), reserved for that order. The decimals
  identify the order: no account, memo or form needed.
- Every ~15 s while someone is paying (every 3 min otherwise) a watcher lists the confirmed USDT transfers that
  reached your address (TronGrid index) and re-reads **each** transaction from a confirmed-only node, decoding its
  receipt and logs itself: success flag, emitting contract = the real USDT contract, `Transfer` event, recipient =
  your address, value. A transfer counts only when both sources agree.
- A transfer of an order's exact amount, made after the order was opened, pays it. An exchange that cannot send the
  decimals: the buyer sends at least the price and pastes the transaction id, verified the same way.
- Anything else (round amount without txid, short payment, payment after cancel) waits in **Payments received** /
  **Needs attention** in the panel. Nothing is lost; each transaction pays one order at most.

Full design, threat model and runbook: [docs/payments.md](docs/payments.md).

## Security

- Discord is the only sign-in. No passwords stored. The Discord token is used once and revoked.
- Sessions are server-side (random 256-bit id, only its hash stored), `HttpOnly; Secure; SameSite=Strict`
  cookie (`__Host-` prefix in production). Members see and close their sessions from the dashboard.
- Owner panel only at `/<ADMIN_PATH>`; its API answers 404 to everyone else; owner = allow-listed Discord id
  **with Discord 2FA on**.
- Origin check on every state-changing call, strict CSP, HSTS, no-referrer, rate limits, 16 KB bodies,
  strict validation (unknown fields rejected).
- Data kept to a minimum: Discord id/name/avatar, licences, orders, redeemed keys, session device name
  (no IP addresses). Licence keys and redeem keys are stored only as hashes; computer ids as an HMAC. For payments:
  amount asked, transaction id, amount received and sending address, all public on the blockchain anyway.
- No wallet key anywhere. The receiving address is checksum-verified at start; any change is logged as a security
  event and shown in red in the panel.

### Your checklist
1. 2FA on Discord (required for the panel), Railway, GitHub and the e-mail behind them. Whoever can edit the Railway
   variables can change the receiving address: that account is now the one to protect most.
2. Receiving address = a wallet only you control (ideally a hardware wallet). Seed phrase on paper only. Copy the
   address from the wallet itself, never from a transaction history (address-poisoning scams).
3. Keep some TRX in that wallet: moving USDT out of it later costs TRX (energy).
4. Open the panel once a day: **Payments received** holds payments that found no order.
5. If the FXR Manager bot also manages the member role, use a different role for each, or let only the site
   manage it, so they don't remove each other's roles.
6. Back up the `/data` volume (Railway → Volume → Backups).
7. The legal texts (Terms, Risk disclosure, Privacy, Refunds) are a solid base, not legal advice: have them
   reviewed for your country before launch, including how you declare crypto income.

## Deploy on Railway

1. **Discord app**: discord.com/developers → New Application → OAuth2 → Client ID / Secret, redirect
   `<PUBLIC_URL>/api/auth/discord/callback`. Bot → token (for the member role), invite it with Manage Roles.
2. **Wallet**: your TRON address (`T...`). Optional: a free TronGrid API key (trongrid.io) for higher rate limits.
3. Push this folder to GitHub, create a Railway project from it (the `Dockerfile` is detected).
4. Add a **Volume** mounted at `/data`, then set the variables from `.env.example`.
5. Deploy. Sign in on the site with Discord, then open `<PUBLIC_URL>/<ADMIN_PATH>`: the **Payments** card shows your
   address and the time of the last blockchain check.

## Tests

`tests/e2e/run.sh` starts the built backend against a mock Discord and a mock TRON chain (fresh database in a temp
folder) and runs 70 end-to-end checks on payments, the panel API, keys, sessions and data at rest.

## Preview build

`npm run build -- --configuration demo` (in `frontend/`) builds a stand-alone preview with hash routing and an
in-browser fake API (sample data, simulated sign-in and payments; its sample address is deliberately invalid so
nothing can be sent to it). The real build contains none of that code.
