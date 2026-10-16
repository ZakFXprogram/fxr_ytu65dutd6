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
         ── NOWPayments hosted checkout (USDT TRC20): amount + address + automatic detection, no TXID to paste
NOWPayments ── signed IPN ──▶ /api/payments/nowpayments/ipn ──▶ payment re-read from NOWPayments' API ──▶ licence
Site     ── adds the Discord member role (bot) ──▶ member opens the install channel, gets the loader + guide
Member   ── Dashboard → Licence → key (shown once) ──▶ FXR Loader ──▶ /api/loader/auth
Owner    ── https://site/<ADMIN_PATH>: overview, orders, members, licences, redeem keys, activity log
```

## Payments (no copy-paste of transaction IDs)

Checkout uses NOWPayments' hosted invoice page. The licence is granted only when **both** are true:
1. the notification carries a valid HMAC-SHA512 signature made with your IPN secret, and
2. NOWPayments' own API, queried with your API key, reports the payment for **this** order as `finished`
   for the right price.

Partial payments and anything that does not match are set aside under **Needs attention** in the panel, where you
can re-check with NOWPayments, accept it manually (logged) or cancel. A reconcile loop re-checks payments every
2 minutes in case a notification arrived while their API was unreachable. The server never holds a wallet key:
NOWPayments forwards the funds to the payout address you set in their dashboard. Keep withdrawals/payouts
locked to that address and protect your NOWPayments account with 2FA.

## Security

- Discord is the only sign-in. No passwords stored. The Discord token is used once and revoked.
- Sessions are server-side (random 256-bit id, only its hash stored), `HttpOnly; Secure; SameSite=Strict`
  cookie (`__Host-` prefix in production). Members see and close their sessions from the dashboard.
- Owner panel only at `/<ADMIN_PATH>`; its API answers 404 to everyone else; owner = allow-listed Discord id
  **with Discord 2FA on**.
- Origin check on every state-changing call, strict CSP, HSTS, no-referrer, rate limits, 16 KB bodies,
  strict validation (unknown fields rejected).
- Data kept to a minimum: Discord id/name/avatar, licences, orders, redeemed keys, session device name
  (no IP addresses). Licence keys and redeem keys are stored only as hashes; computer ids as an HMAC.

### Your checklist
1. 2FA on Discord (required for the panel), NOWPayments, Railway, GitHub and the e-mail behind them.
2. NOWPayments payout address = a wallet only you control (ideally a hardware wallet). Seed phrase on paper only.
3. Never copy an address from your TRON history (address-poisoning scams). Copy it from your wallet.
4. If the FXR Manager bot also manages the member role, use a different role for each, or let only the site
   manage it, so they don't remove each other's roles.
5. Back up the `/data` volume (Railway → Volume → Backups).
6. The legal texts (Terms, Risk disclosure, Privacy, Refunds) are a solid base, not legal advice: have them
   reviewed for your country before launch.

## Deploy on Railway

1. **Discord app**: discord.com/developers → New Application → OAuth2 → Client ID / Secret, redirect
   `<PUBLIC_URL>/api/auth/discord/callback`. Bot → token (for the member role), invite it with Manage Roles.
2. **NOWPayments**: create the account, set your payout wallet, create an API key and an IPN secret, set the
   IPN callback URL `<PUBLIC_URL>/api/payments/nowpayments/ipn`.
3. Push this folder to GitHub, create a Railway project from it (the `Dockerfile` is detected).
4. Add a **Volume** mounted at `/data`, then set the variables from `.env.example`.
5. Deploy. Sign in on the site with Discord, then open `<PUBLIC_URL>/<ADMIN_PATH>`.

## Preview build

`npm run build -- --configuration demo` (in `frontend/`) builds a stand-alone preview with hash routing and an
in-browser fake API (sample data, simulated sign-in and payments). The real build contains none of that code.
