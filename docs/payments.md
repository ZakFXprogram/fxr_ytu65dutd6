# Payments: USDT (TRC20) straight to the owner's wallet

Design notes, security model and runbook for the payment system of the FXR OrderFlow website.
Code: `backend/src/payments/tron.ts`, `backend/src/payments/tron.client.ts`, `backend/src/orders/orders.service.ts`.

## 1. Goals and non-goals

| Goal | How |
|---|---|
| No third party holding the money, no fee for the owner | Buyers pay the owner's own TRON address. |
| Nothing on the server that can move funds | Only the **public** address is configured. No private key, no seed, no signing code. |
| Automatic activation, no form for normal payments | A unique amount per order, read from the blockchain. |
| Nothing lost when a buyer gets it wrong | Every transfer to the address is recorded; unmatched ones wait for the owner. |
| A transaction can never pay twice | Unique transaction id in the database, matching inside a DB transaction. |

Not covered: refunds (sent by the owner from the wallet), other tokens or networks (cannot be recovered by the site),
chargebacks (do not exist on-chain).

## 2. Flow

```
 buyer                      site (NestJS)                          TRON (read-only)
 ─────                      ─────────────                          ────────────────
 /buy/month1 ──POST /api/orders──▶ price 8.00 + unique 0.0037
                                  = 8.0037, reserved 30 min + 6 h
 /checkout/<id> ◀── address, 8.0037, QR, timer
 wallet/exchange ──────────── sends 8.0037 USDT ─────────────────▶ block confirmed (~1 min)
                            watcher (15 s while someone pays,
                            3 min otherwise)
                              1. index: USDT transfers TO address ◀── TronGrid /v1/accounts/<addr>/transactions/trc20
                                 since cursor - 10 min                 ?only_confirmed&only_to&contract_address
                              2. node: re-read EACH new tx          ◀── /walletsolidity/gettransactioninfobyid
                                 decode receipt + logs ourselves
                              3. both agree → record → match
                              4. exact amount of one open order
                                 → paid → licence + Discord role
 page polls every 5 s ◀── "You're in"
```

## 3. Unique amounts

- `amount_micro = price_micro + n × 100` (USDT has 6 decimals; 100 micro = 0.0001 USDT), `n` drawn at random among the
  values that no unpaid order of the same price created in the last window + 6 h + 1 h holds. First `1..99`
  (≤ 0.0099 USDT extra), then `1..999` if those are all taken, then HTTP 429 "try again in a few minutes".
- No `await` between choosing and inserting: two buyers can never get the same amount (single-threaded event loop).
- All amounts are integers of micro-USDT. No floating point is used for money.
- The plan price (`orders.amount`, e.g. `8.00`) is what revenue counts; the unique part is not revenue.

## 4. What makes a transfer count

The index (TronGrid) is only used to **find** candidate transactions. Every candidate is re-read from the node's
`walletsolidity` API (confirmed blocks only) and decoded by our code:

1. `receipt.result === "SUCCESS"` and no top-level `result: "FAILED"`.
2. For each event log: emitter == USDT contract `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` (hex `a614f803…ded13c`).
   Anything named "USDT" from another contract is ignored (fake-token scam).
3. `topics[0]` == `keccak256("Transfer(address,address,uint256)")` = `ddf252ad…523b3ef`, exactly 3 topics.
4. `topics[2]` (recipient) == our address. Value = `data`, summed over the matching logs of the transaction.
5. The node's value must equal the index's value, else the transfer is recorded as `ignored` ("sources disagree")
   and an attention event is logged. Point `TRON_NODE_URL` at a different provider to make the two sources independent.
6. A transaction the index lists but the node does not know yet holds the cursor (retried next pass); after 1 hour it
   is set aside.

## 5. Matching rules (in order)

Inside one SQLite transaction, for a transfer both sources agree on:

1. Already in `chain_transfers` → nothing (idempotent).
2. Recorded as `unmatched`, then:
3. **A buyer gave this transaction id** for an order (`claimed_txid`) → settle that claim:
   - block time before the order was opened (−2 min tolerance) → claim dropped;
   - value is exactly the reserved amount of **another** live order → that order is paid, the claim is dropped
     (stops a buyer from claiming someone else's payment);
   - value ≥ plan price → paid ("matched by transaction id"); 0 < value < price → `partially_paid`.
4. **Exact amount** of one order with status pending / confirming / expired / cancelled, opened before the block and
   whose window + 6 h covers the block time → paid (late payments get a note). A cancelled order goes to `review`.
5. Several candidates (should not happen) or none → stays `unmatched`, attention event.

`orders.txid` is UNIQUE: a transaction pays one order at most, even through the owner's manual "assign".

## 6. Transaction ids given by buyers (exchanges)

`POST /api/orders/:id/txid` (signed-in owner of the order, 12/min per IP):
- format `^(0x)?[0-9a-f]{64}$`; order pending / expired / confirming and opened less than 7 days ago;
- refused if the txid is attached to another order, already used, failed, did not send USDT to our address, or is
  older than the order;
- if the transfer is known (`unmatched`), it is settled at once; otherwise both sources are asked right away; if the
  index has not listed it yet, the order goes to `confirming` and the watcher retries every pass; after 6 h → `review`.

Residual risk, accepted: blockchain data is public. Someone watching the address could claim another buyer's
*round-amount* exchange payment before that buyer does (exact-amount payments are protected by rule 3).
Mitigations: the claim must be made from an order opened **before** the payment, a second claim on the same txid is
refused and logged, and the owner can revoke. For a low-price product this is an acceptable trade-off.

## 7. Threat model

| Threat | Defence |
|---|---|
| Server compromised | No key: funds cannot be moved. The attacker could change the displayed address → see next row. |
| Receiving address replaced (env vars, code) | Address checksum-verified at start; any change logged as a `security` event and shown in red in the panel for 14 days. Protect Railway/GitHub with 2FA. |
| Fake token named USDT | Contract checked on the node's logs, not the token name. |
| Transfer to another wallet / failed tx | Recipient and receipt decoded from the node. |
| Lying or broken index | Every tx re-read from the node; disagreement = ignored + alert. |
| Replay of an old transaction | Unique txid; block time must be after the order was opened. |
| Two orders with the same amount | Reservation rule (§3); ambiguous match is never auto-paid. |
| Buyer claims someone else's payment | Rule 3 + time rule + unique txid (§6). |
| Address poisoning (look-alike address in history) | Checkout tells the buyer to copy from the page and check the first and last 4 characters; the owner copies the address from the wallet itself. |
| Index/node outage | Payments are not lost: the cursor waits and the next pass catches up (10-min overlap). The panel shows the last successful check and the last error. |
| Panel brute force | Panel only at the secret path, Discord owner id + Discord 2FA, 404 for everyone else. |

## 8. Data model

`orders` (new columns): `base_micro`, `amount_micro` (reserved exact amount), `claimed_txid`, `claim_ms`,
`paid_micro`, `payer` (sending address), `paid_tx_ms`; existing `txid` (UNIQUE), `pay_to`, `expires_ms`.

`chain_transfers`: `txid` PK, `from_addr`, `value_micro`, `block_ms`, `status` (`matched` | `unmatched` | `ignored`),
`order_id`, `note`, `seen_ms`, `decided_by`.

`meta`: `tron_address`, `tron_address_changed_ms`, `tron_cursor_ms`, `tron_last_ok_ms`, `tron_last_error`,
`tron_last_error_ms`.

## 9. Configuration

| Variable | Default | Notes |
|---|---|---|
| `TRON_RECEIVING_ADDRESS` | — | Public `T...` address. Empty = checkout closed. Refused if the checksum is wrong or if it is the USDT contract. |
| `TRONGRID_API_KEY` | — | Optional, read-only. Sent as `TRON-PRO-API-KEY` to TronGrid only. |
| `PAYMENT_WINDOW_MINUTES` | 30 | 10-240. |
| `TRON_API_BASE` | `https://api.trongrid.io` | Index. https only in production. |
| `TRON_NODE_URL` | same as index | Node used for the second check. Another provider = independent source. |
| `TRON_NODE_API_KEY` | TronGrid key if same host | Key for that node, if any. |

## 10. Runbook

- **Payment found no order** (Panel → Payments received → *To assign*): ask the member for their 8-character order
  number, check the amount, *Assign* (marks the order paid and grants the licence) or *Set aside* with a reason.
- **Short payment** (`partially_paid`): agree with the member; *Mark as paid* with a note, or refund the difference.
- **Refund**: send USDT (TRC20) from your wallet to an address the member gives you in writing; note it on the order.
- **Change the receiving address**: update `TRON_RECEIVING_ADDRESS` in Railway. Open orders keep their amounts; the
  watcher reads the new address from now on (it looks back 24 h on it). Watch the old address for late payments for a
  few hours and assign them by hand if needed. The panel shows the change in red: that is expected after your own change.
- **"Blockchain check failing"** in the panel: TronGrid unreachable or rate-limited. Add a `TRONGRID_API_KEY`; nothing
  is lost meanwhile.
- **Fees**: buyers pay the network fee. Moving USDT out of your wallet later costs TRX (energy): keep some TRX there.

## 11. Tests

`tests/e2e/run.sh` (70 checks) runs the real backend against a mock TronGrid index + node that deliberately returns every
transfer it knows (any token, any recipient), so the site's own filters are exercised: fake token, other recipient,
failed transaction, sources that disagree, node lagging behind the index, exact amount, late payment, cancelled order,
round amount + txid, txid replay on another order, txid older than the order, claim of another order's exact payment,
short payment, owner assign / set aside, address change alert, data at rest.

`tests/e2e/real_tron_fixtures.test.js` feeds **real** TronGrid responses (captured from api.trongrid.io on 2026-10-17:
a plain USDT transfer, and a transaction sent through a router contract that pays two wallets at once) to the parser,
so the field names and log decoding are checked against the actual API, not only against the mock.
