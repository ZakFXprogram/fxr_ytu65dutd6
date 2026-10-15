# FXR OrderFlow — website

A real website + admin for the FXR OrderFlow studies, built as:

- **frontend/** — Angular 19 (home, studies, pricing, install guide, my-licence, FAQ, legal, admin).
- **backend/** — NestJS (Express), SQLite via the built-in `node:sqlite`. Serves the Angular build and the API
  on one origin, so there is no CORS and the whole thing is one Railway service.

## Architecture

```
Browser ── Angular SPA ─┐
                        ├─▶  NestJS (one service on Railway)
Payment provider ──────▶ │     /api/site, /api/licence/status      (public)
(NOWPayments/BTCPay…)    │     /api/webhook/paid                   (provider → issue licence)
                        │     /api/loader/auth                    (FXR Loader checks a licence)
FXR Loader (MotiveWave)─┘     /api/admin/*                        (cookie-session admin)
                              SQLite on a Railway volume (/data)
```

## Security

- Access depends only on an **active licence**, never on a Discord role.
- Licence keys are **never stored raw** (sha256 hash for lookup).
- Admin is a signed, HttpOnly, SameSite=strict cookie; passwords checked in constant time.
- Helmet (CSP, no-sniff, frame-deny), per-route rate limiting, strict input validation.
- **No wallet keys, ever.** Payments are confirmed by an external crypto provider that calls
  `/api/webhook/paid` (HMAC-signed). This server never touches a private key or moves funds.

## Payments

Payment confirmation is delegated to a crypto payment provider (NOWPayments, BTCPay Server, Coinbase
Commerce…). Point each plan's `CHECKOUT_*` variable at the provider's hosted checkout, and set the provider's
webhook to `POST /api/webhook/paid` with header `X-FXR-Signature: hex HMAC-SHA256(WEBHOOK_SECRET, body)` and
body `{ "userRef": "<discord id>", "plan": "<plan id>" }`. The server then issues the licence.

## Deploy on Railway

1. Push this folder to GitHub; create a Railway project from it (the `Dockerfile` is detected).
2. Add a **Volume** mounted at `/data`.
3. Set the variables from `.env.example` (`PUBLIC_URL`, `ADMIN_PASSWORD`, `WEBHOOK_SECRET`, the `CHECKOUT_*`).
4. Deploy. Every push redeploys (CI/CD).

## Local run

```
cd frontend && npm ci && npm run build && cd ..
cd backend  && npm ci && npm run build
ADMIN_PASSWORD=dev12345 DATA_DIR=./data node backend/dist/main.js
# open http://127.0.0.1:8080  (admin at /admin)
```

## Not built here

The on-chain payment watcher and the encrypted in-memory module delivery to the loader are intentionally
left to the external provider / a later step. The loader endpoint here validates licences only.
