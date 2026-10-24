import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { CONFIG, type AppConfig } from '../config';
import { DbService, newId } from '../db/db.service';
import { LicencesService } from '../licences/licences.service';
import { RoleSyncService } from '../roles/role-sync.service';
import { PromosService } from '../promos/promos.service';
import { TronClient } from '../payments/tron.client';
import { TXID, USDT_CONTRACT, fromMicro, toMicro } from '../payments/tron';

export interface OrderRow {
  id: string;
  user_id: string;
  plan: string;
  amount: string; // plan price in USDT, e.g. "8.00" (revenue is counted on this)
  pay_to: string;
  status: string;
  txid: string | null; // the transaction that paid it
  licence_id: string | null;
  note: string | null;
  decided_by: string | null;
  created_ms: number;
  expires_ms: number;
  decided_ms: number | null;
  updated_ms: number;
  terms_ms: number | null;
  base_micro: number | null;
  amount_micro: number | null; // exact amount asked (unique among recent orders)
  claimed_txid: string | null;
  claim_ms: number | null;
  paid_micro: number | null;
  payer: string | null;
  paid_tx_ms: number | null;
  promo_id: string | null;
  promo_code: string | null;
  discount_pct: number | null;
  base_full_micro: number | null;
}

export interface TransferRow {
  txid: string;
  from_addr: string | null;
  value_micro: number;
  block_ms: number;
  status: string; // matched | unmatched | ignored
  order_id: string | null;
  note: string | null;
  seen_ms: number;
  decided_by: string | null;
}

/** A transfer both blockchain sources agree on. */
interface Seen {
  txid: string;
  from: string | null;
  value: bigint;
  blockMs: number;
}

export const ORDER_PENDING = 'pending'; // unique amount reserved, waiting for the payment
export const ORDER_CONFIRMING = 'confirming'; // the buyer gave a transaction id that is not confirmed yet
export const ORDER_PAID = 'paid';
export const ORDER_PARTIAL = 'partially_paid'; // less than the price arrived: the owner decides
export const ORDER_REVIEW = 'review'; // anything that does not fit: the owner decides
export const ORDER_FAILED = 'failed';
export const ORDER_EXPIRED = 'expired';
export const ORDER_CANCELLED = 'cancelled';
export const ORDER_REFUNDED = 'refunded';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MAX_OPEN_ORDERS = 3;
/** After its window, an order's exact amount stays reserved and is still recognised for this long. */
const LATE_MS = 6 * HOUR;
/** A transaction id the buyer gave that never shows up confirmed goes to review after this. */
const CLAIM_GIVE_UP_MS = 6 * HOUR;
/** A buyer can point at a transaction up to this long after opening the order. */
const CLAIM_MAX_AGE_MS = 7 * DAY;
/** Clock tolerance between block times and our clock. */
const SKEW_MS = 2 * MINUTE;
/** A transaction listed by the index but still unknown to the node after this is set aside. */
const UNCONFIRMED_GIVE_UP_MS = HOUR;
/** Sanity bound: 10 million USDT. */
const MAX_MICRO = 10_000_000_000_000n;
const POLL_IDLE_MS = 3 * MINUTE;

const ID8 = (id: string) => id.slice(0, 8).toUpperCase();
const TX10 = (txid: string) => txid.slice(0, 10) + '…';

/**
 * Direct USDT (TRC20) payments to the owner's own TRON address. No payment provider, no wallet key here.
 *
 *  1. Each order asks for the plan price plus a unique 0.0001-0.0999 USDT ("8.0037"), reserved for that order
 *     during its window and 6 hours after it. The decimals identify the order.
 *  2. A watcher lists the confirmed USDT transfers that reached the address (index) and re-reads every one of
 *     them from a confirmed-only node, decoding the receipt and logs itself (contract, recipient, value). A
 *     transfer counts only when both sources agree.
 *  3. A transfer of an order's exact amount, made after the order was opened, pays that order. Buyers whose
 *     exchange cannot send the exact decimals give their transaction id instead; it is checked the same way.
 *  4. Everything else (unknown amount, short payment, conflict) waits in the owner's panel. Nothing is lost.
 * Each transaction can pay one order only (unique transaction id in the database).
 */
@Injectable()
export class OrdersService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Orders');
  private sweepTimer?: NodeJS.Timeout;
  private pollTimer?: NodeJS.Timeout;
  private polling: Promise<void> | null = null;
  private readonly activePollMs: number;

  constructor(
    private readonly db: DbService,
    private readonly licences: LicencesService,
    private readonly tron: TronClient,
    private readonly roles: RoleSyncService,
    private readonly promos: PromosService,
    @Inject(CONFIG) private readonly cfg: AppConfig,
  ) {
    const dev = Number(process.env['TRON_POLL_MS']);
    this.activePollMs = !cfg.production && dev >= 200 ? dev : 15_000;
  }

  private get windowMs(): number {
    return this.cfg.tron.windowMinutes * MINUTE;
  }

  onModuleInit(): void {
    this.sweep();
    this.sweepTimer = setInterval(() => this.sweep(), MINUTE);
    this.sweepTimer.unref();
    if (!this.tron.configured) return;
    this.watchAddress();
    this.schedule(3000);
  }

  onModuleDestroy(): void {
    clearInterval(this.sweepTimer);
    clearTimeout(this.pollTimer);
  }

  /** Remembers the receiving address; a change is logged as a security event and shown in the panel. */
  private watchAddress(): void {
    const addr = this.tron.address;
    const prev = this.db.getMeta('tron_address');
    if (prev === addr) return;
    const now = Date.now();
    if (prev) {
      this.db.logEvent('security', `Receiving address changed from ${prev} to ${addr}`);
      this.db.setMeta('tron_address_changed_ms', String(now));
      this.log.warn(`receiving address changed from ${prev} to ${addr}`);
    }
    this.db.setMeta('tron_address', addr);
    this.db.setMeta('tron_cursor_ms', String(now - DAY));
  }

  /** Orders past their window expire (their amount stays reserved for LATE_MS). */
  sweep(): void {
    const now = Date.now();
    this.db.run('UPDATE orders SET status = ?, updated_ms = ? WHERE status = ? AND expires_ms <= ?', ORDER_EXPIRED, now, ORDER_PENDING, now);
  }

  byId(id: string): OrderRow | undefined {
    return this.db.get<OrderRow>('SELECT * FROM orders WHERE id = ?', id);
  }

  /** Someone else's order answers 404, exactly like a missing one. */
  mine(id: string, userId: string): OrderRow {
    const o = this.byId(id);
    if (!o || o.user_id !== userId) throw new NotFoundException();
    return o;
  }

  forUser(userId: string): OrderRow[] {
    this.sweep();
    return this.db.all<OrderRow>('SELECT * FROM orders WHERE user_id = ? ORDER BY created_ms DESC LIMIT 50', userId);
  }

  // ---------- opening an order

  create(userId: string, planId: string, promoCode?: string): OrderRow {
    const plan = this.licences.plan(planId);
    if (!plan) throw new NotFoundException('Unknown plan');
    if (!this.tron.configured) throw new ServiceUnavailableException('Checkout is not open yet. Please try again later.');
    this.sweep();
    const now = Date.now();

    // resolve a promo code, if any (a bad code is reported rather than silently ignored)
    let promoId: string | null = null;
    let pct = 0;
    let promoNorm: string | null = null;
    if (promoCode && promoCode.trim()) {
      const r = this.promos.usable(promoCode);
      if ('error' in r) throw new BadRequestException(r.error);
      promoId = r.promo.id;
      pct = r.promo.percent;
      promoNorm = r.promo.code;
    }

    // clicking "Buy" twice reuses the open order while it has time left (same plan AND same promo)
    const same = this.db.get<OrderRow>(
      "SELECT * FROM orders WHERE user_id = ? AND plan = ? AND status = ? AND expires_ms > ? AND IFNULL(promo_id,'') = ? ORDER BY created_ms DESC LIMIT 1",
      userId, planId, ORDER_PENDING, now + 10 * MINUTE, promoId ?? '',
    );
    if (same) return same;

    const open = this.db.get<{ n: number }>(
      'SELECT COUNT(*) AS n FROM orders WHERE user_id = ? AND status IN (?, ?)', userId, ORDER_PENDING, ORDER_CONFIRMING,
    )!.n;
    if (open >= MAX_OPEN_ORDERS) {
      throw new HttpException('You already have payments in progress. Finish or cancel one first.', HttpStatus.TOO_MANY_REQUESTS);
    }

    // discounted price, rounded to the cent (never below 0.01); the unique decimals are added on top
    const full = toMicro(plan.price);
    const base = pct ? Math.max(10_000, Math.round((full * (100 - pct)) / 100 / 10_000) * 10_000) : full;

    // no await between choosing the amount and saving it: two buyers can never get the same one
    const amount = this.pickAmount(base);
    const id = newId();
    this.db.run(
      `INSERT INTO orders(id,user_id,plan,amount,pay_to,status,created_ms,expires_ms,updated_ms,terms_ms,base_micro,amount_micro,promo_id,promo_code,discount_pct,base_full_micro)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id, userId, planId, fromMicro(base, 2), this.tron.address, ORDER_PENDING, now, now + this.windowMs, now, now, base, amount,
      promoId, promoNorm, pct || null, pct ? full : null,
    );
    this.db.logEvent('order',
      `Order ${ID8(id)} opened: ${plan.label}, ${fromMicro(amount, 4)} USDT${promoNorm ? ` (promo ${promoNorm} -${pct}%)` : ''}`, userId);
    this.kick();
    return this.byId(id)!;
  }

  /** Price for a plan with an optional promo applied — for the checkout page to show before paying. */
  quote(planId: string, promoCode?: string): {
    plan: string; price: number; discountPct: number; newPrice: number; valid: boolean; kind?: string; code?: string; message?: string;
  } {
    const plan = this.licences.plan(planId);
    if (!plan) throw new NotFoundException('Unknown plan');
    const base = { plan: planId, price: plan.price, discountPct: 0, newPrice: plan.price, valid: false };
    if (!promoCode || !promoCode.trim()) return base;
    const r = this.promos.usable(promoCode);
    if ('error' in r) return { ...base, message: r.error };
    const pct = r.promo.percent;
    const micro = Math.max(10_000, Math.round((toMicro(plan.price) * (100 - pct)) / 100 / 10_000) * 10_000);
    return { plan: planId, price: plan.price, discountPct: pct, newPrice: Number(fromMicro(micro, 2)), valid: true, kind: r.promo.kind, code: r.promo.code };
  }

  /** Price + n x 0.0001 USDT, n random among the values no recent unpaid order holds (1-99, then up to 999). */
  private pickAmount(base: number): number {
    const since = Date.now() - this.windowMs - LATE_MS - HOUR;
    const taken = new Set(
      this.db
        .all<{ a: number }>(
          "SELECT amount_micro AS a FROM orders WHERE base_micro = ? AND amount_micro IS NOT NULL AND status != 'paid' AND created_ms > ?",
          base, since,
        )
        .map((r) => r.a),
    );
    for (const max of [99, 999]) {
      const free: number[] = [];
      for (let n = 1; n <= max; n++) if (!taken.has(base + n * 100)) free.push(base + n * 100);
      if (free.length) return free[randomInt(free.length)];
    }
    throw new HttpException('A lot of people are checking out right now. Please try again in a few minutes.', HttpStatus.TOO_MANY_REQUESTS);
  }

  cancel(id: string, userId: string): OrderRow {
    const o = this.mine(id, userId);
    if (o.status !== ORDER_PENDING) throw new ConflictException('Only an order waiting for its payment can be cancelled.');
    this.db.run('UPDATE orders SET status = ?, updated_ms = ? WHERE id = ?', ORDER_CANCELLED, Date.now(), id);
    return this.byId(id)!;
  }

  // ---------- the buyer gives a transaction id (exchange that cannot send the exact decimals)

  async claim(id: string, userId: string, rawTxid: string): Promise<OrderRow> {
    const txid = String(rawTxid ?? '').trim().toLowerCase().replace(/^0x/, '');
    if (!TXID.test(txid)) throw new UnprocessableEntityException('A transaction id (hash) is 64 characters: 0-9 and a-f.');
    const o = this.mine(id, userId);
    if (![ORDER_PENDING, ORDER_EXPIRED, ORDER_CONFIRMING].includes(o.status) || Date.now() - o.created_ms > CLAIM_MAX_AGE_MS) {
      throw new ConflictException('This order cannot take a payment anymore. Contact support on Discord.');
    }
    if (!this.tron.configured) throw new ServiceUnavailableException('Payments are paused. Please try again later.');
    const used = this.db.get<{ id: string }>('SELECT id FROM orders WHERE (txid = ? OR claimed_txid = ?) AND id != ?', txid, txid, o.id);
    if (used) throw new ConflictException('This transaction is already attached to another order.');

    const known = this.transfer(txid);
    if (known) {
      if (known.status !== 'unmatched') throw new ConflictException('This transaction has already been used.');
      if (known.block_ms < o.created_ms - SKEW_MS) throw new UnprocessableEntityException('This transaction was made before you opened this order.');
      this.db.tx(() => {
        this.attachClaim(o, txid);
        this.settleClaim(this.byId(o.id)!, { txid, from: known.from_addr, value: BigInt(known.value_micro), blockMs: known.block_ms });
      });
      return this.byId(o.id)!;
    }

    let seen: Seen | null = null;
    try {
      const r = await this.confirmBoth(txid);
      if (r === 'failed') throw new UnprocessableEntityException('This transaction failed on the blockchain: nothing was sent.');
      if (r === 'not-ours') {
        throw new UnprocessableEntityException('This transaction did not send USDT (TRC20) to our address. Check the network and the address.');
      }
      if (r === 'mismatch') {
        this.db.logEvent('attention', `Transaction ${TX10(txid)} given for order ${ID8(o.id)}: blockchain sources disagree`, o.user_id);
        throw new UnprocessableEntityException('This transaction could not be verified. Contact support on Discord.');
      }
      seen = r;
    } catch (e) {
      if (e instanceof HttpException) throw e;
      this.log.warn(`claim check ${TX10(txid)}: ${(e as Error).message}`); // node unreachable: the watcher retries
    }
    if (seen && seen.blockMs < o.created_ms - SKEW_MS) throw new UnprocessableEntityException('This transaction was made before you opened this order.');

    this.attachClaim(o, txid);
    if (seen) this.ingest(seen);
    this.kick();
    return this.byId(o.id)!;
  }

  private attachClaim(o: OrderRow, txid: string): void {
    const now = Date.now();
    this.db.run(
      'UPDATE orders SET claimed_txid = ?, claim_ms = ?, status = ?, updated_ms = ? WHERE id = ?',
      txid, now, ORDER_CONFIRMING, now, o.id,
    );
    this.db.logEvent('order', `Transaction ${TX10(txid)} given for order ${ID8(o.id)}`, o.user_id);
  }

  // ---------- watching the blockchain

  private schedule(ms: number): void {
    clearTimeout(this.pollTimer);
    this.pollTimer = setTimeout(() => {
      void this.poll().finally(() => this.schedule(this.waiting() ? this.activePollMs : POLL_IDLE_MS));
    }, ms);
    this.pollTimer.unref();
  }

  /** Something to wait for: poll often. Otherwise every few minutes (late or unknown payments). */
  private waiting(): boolean {
    return (
      this.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM orders WHERE status IN ('pending','confirming')")!.n > 0
    );
  }

  /** A new order or a claim: look soon. */
  private kick(): void {
    if (this.tron.configured && !this.polling) this.schedule(this.activePollMs);
  }

  /** One pass. Concurrent callers share the same pass. */
  poll(): Promise<void> {
    if (!this.tron.configured) return Promise.resolve();
    if (!this.polling) this.polling = this.pollOnce().finally(() => (this.polling = null));
    return this.polling;
  }

  private async pollOnce(): Promise<void> {
    this.sweep();
    const now = Date.now();
    const cursor = Number(this.db.getMeta('tron_cursor_ms')) || now - DAY;
    let list;
    try {
      list = await this.tron.incoming(cursor - 10 * MINUTE);
    } catch (e) {
      return this.health(`blockchain index unreachable: ${(e as Error).message}`);
    }

    // the index is asked for USDT to our address only, but nothing it says is taken on trust
    const groups = new Map<string, { value: bigint; blockMs: number; from: string }>();
    for (const t of list) {
      if (t.contract !== USDT_CONTRACT || t.to !== this.tron.address || (t.type && t.type !== 'Transfer')) continue;
      const g = groups.get(t.txid);
      if (g) g.value += t.value;
      else groups.set(t.txid, { value: t.value, blockMs: t.blockMs, from: t.from });
    }

    let next = cursor;
    let held = false; // a transaction we could not confirm yet: the cursor must not pass it
    for (const [txid, g] of [...groups].sort((a, b) => a[1].blockMs - b[1].blockMs)) {
      if (!this.transfer(txid)) {
        let c;
        try {
          c = await this.tron.check(txid);
        } catch (e) {
          this.health(`blockchain node unreachable: ${(e as Error).message}`);
          held = true;
          break;
        }
        if (!c) {
          if (now - g.blockMs < UNCONFIRMED_GIVE_UP_MS) {
            held = true;
            continue;
          }
          this.record(txid, g.from, g.value, g.blockMs, 'ignored', 'listed by the index but never confirmed by the node');
          this.db.logEvent('attention', `Incoming transaction ${TX10(txid)} could not be confirmed and was set aside`);
        } else if (!c.success || c.value !== g.value) {
          const nodeSays = c.success ? `${fromMicro(c.value)} USDT` : 'failed';
          this.record(txid, g.from, g.value, g.blockMs, 'ignored', `sources disagree (index ${fromMicro(g.value)} USDT, node ${nodeSays})`);
          this.db.logEvent('attention', `Incoming transaction ${TX10(txid)} ignored: the blockchain sources disagree`);
        } else {
          this.ingest({ txid, from: c.from ?? g.from, value: c.value, blockMs: c.blockMs || g.blockMs });
        }
      }
      if (!held) next = Math.max(next, g.blockMs);
    }
    this.db.setMeta('tron_cursor_ms', String(next));
    await this.retryClaims();
    this.health(null);
  }

  private health(error: string | null): void {
    const now = String(Date.now());
    if (error) {
      this.log.warn(error);
      this.db.setMeta('tron_last_error', error.slice(0, 200));
      this.db.setMeta('tron_last_error_ms', now);
    } else {
      this.db.setMeta('tron_last_ok_ms', now);
    }
  }

  /** Both sources about one transaction id, for claims. */
  private async confirmBoth(txid: string): Promise<Seen | null | 'failed' | 'not-ours' | 'mismatch'> {
    const c = await this.tron.check(txid);
    if (!c) return null; // unknown or not confirmed yet
    if (!c.success) return 'failed';
    if (c.value <= 0n) return 'not-ours';
    const listed = (await this.tron.incoming(c.blockMs - 1000, 2)).filter(
      (t) => t.txid === txid && t.contract === USDT_CONTRACT && t.to === this.tron.address,
    );
    if (!listed.length) return null; // index not caught up yet
    const v = listed.reduce((s, t) => s + t.value, 0n);
    if (v !== c.value) return 'mismatch';
    return { txid, from: c.from ?? listed[0].from, value: c.value, blockMs: c.blockMs || listed[0].blockMs };
  }

  private async retryClaims(): Promise<void> {
    const rows = this.db.all<OrderRow>(
      'SELECT * FROM orders WHERE status = ? AND claimed_txid IS NOT NULL ORDER BY claim_ms LIMIT 20', ORDER_CONFIRMING,
    );
    for (const o of rows) {
      const txid = o.claimed_txid!;
      const known = this.transfer(txid);
      if (known) {
        if (known.status === 'unmatched') {
          this.db.tx(() => this.settleClaim(o, { txid, from: known.from_addr, value: BigInt(known.value_micro), blockMs: known.block_ms }));
        } else {
          this.setStatus(o, ORDER_REVIEW, 'the transaction given was already used');
        }
        continue;
      }
      try {
        const r = await this.confirmBoth(txid);
        if (r && typeof r === 'object') {
          this.ingest(r);
          continue;
        }
        if (r === 'failed' || r === 'not-ours' || r === 'mismatch') {
          this.setStatus(o, ORDER_REVIEW, `the transaction given ${r === 'failed' ? 'failed' : r === 'not-ours' ? 'did not pay our address' : 'could not be verified'}`);
          continue;
        }
      } catch (e) {
        this.log.warn(`claim ${TX10(txid)}: ${(e as Error).message}`);
        return; // sources unreachable: try again on the next pass
      }
      if (Date.now() - (o.claim_ms ?? o.updated_ms) > CLAIM_GIVE_UP_MS) this.setStatus(o, ORDER_REVIEW, 'the transaction given never showed up confirmed');
    }
  }

  // ---------- matching

  transfer(txid: string): TransferRow | undefined {
    return this.db.get<TransferRow>('SELECT * FROM chain_transfers WHERE txid = ?', txid);
  }

  private record(txid: string, from: string | null, value: bigint, blockMs: number, status: string, note: string | null): void {
    const v = value > MAX_MICRO ? Number(MAX_MICRO) : Number(value);
    this.db.run(
      `INSERT INTO chain_transfers(txid, from_addr, value_micro, block_ms, status, note, seen_ms) VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(txid) DO NOTHING`,
      txid, from, v, blockMs, status, note, Date.now(),
    );
  }

  /** A transfer both sources agree on. Recorded once; pays at most one order. Returns true when it paid one. */
  private ingest(t: Seen): boolean {
    return this.db.tx(() => {
      if (this.transfer(t.txid)) return false;
      if (t.value <= 0n || t.value > MAX_MICRO) {
        this.record(t.txid, t.from, t.value, t.blockMs, 'ignored', 'amount out of range');
        return false;
      }
      this.record(t.txid, t.from, t.value, t.blockMs, 'unmatched', null);

      // 1) the buyer told us this transaction id
      const claimed = this.db.get<OrderRow>(
        "SELECT * FROM orders WHERE claimed_txid = ? AND status NOT IN ('paid','refunded') ORDER BY claim_ms LIMIT 1", t.txid,
      );
      if (claimed) return this.settleClaim(claimed, t);

      // 2) the exact amount of one recent order, paid after it was opened
      const v = Number(t.value);
      const owners = this.exactOwners(v, t.blockMs);
      if (owners.length === 1) return this.payExact(owners[0], t);
      if (owners.length > 1) {
        this.noteTransfer(t.txid, 'several orders ask for this amount');
        this.db.logEvent('attention', `Payment of ${fromMicro(v)} USDT matches several orders (tx ${TX10(t.txid)})`);
        return false;
      }
      this.db.logEvent('attention', `Payment of ${fromMicro(v)} USDT received with no matching order (tx ${TX10(t.txid)})`);
      return false;
    });
  }

  /** Orders whose reserved amount is exactly v and whose window (+ late period) covers the block time. */
  private exactOwners(v: number, blockMs: number, exceptId = ''): OrderRow[] {
    return this.db.all<OrderRow>(
      `SELECT * FROM orders WHERE amount_micro = ? AND id != ? AND status IN ('pending','confirming','expired','cancelled')
         AND created_ms <= ? AND expires_ms + ? >= ?`,
      v, exceptId, blockMs + SKEW_MS, LATE_MS, blockMs,
    );
  }

  private payExact(o: OrderRow, t: Seen): boolean {
    this.link(o, t);
    if (o.status === ORDER_CANCELLED) {
      this.setStatus(this.byId(o.id)!, ORDER_REVIEW, 'paid after it was cancelled');
      return false;
    }
    const late = t.blockMs > o.expires_ms;
    this.markPaid(this.byId(o.id)!, 'blockchain', late ? 'paid after the payment window' : null);
    return true;
  }

  /** The buyer pointed at this transaction. Must be called inside a transaction. */
  private settleClaim(o: OrderRow, t: Seen): boolean {
    const v = Number(t.value);
    if (t.blockMs < o.created_ms - SKEW_MS) {
      this.clearClaim(o, 'the transaction given is older than the order');
      return false;
    }
    // the exact amount of ANOTHER order: it belongs to that order, not to the one claiming it
    const owners = this.exactOwners(v, t.blockMs, o.id);
    if (owners.length === 1) {
      this.clearClaim(o, 'the transaction given belongs to another order');
      this.db.logEvent('attention', `Order ${ID8(o.id)} pointed at a transaction that pays order ${ID8(owners[0].id)}`, o.user_id);
      return this.payExact(owners[0], t);
    }
    this.link(o, t);
    const fresh = this.byId(o.id)!;
    if (v >= (o.base_micro ?? toMicro(Number(o.amount)))) {
      this.markPaid(fresh, 'blockchain', 'matched by transaction id');
      return true;
    }
    this.setStatus(fresh, ORDER_PARTIAL, `received ${fromMicro(v)} USDT of ${o.amount}`);
    return false;
  }

  private clearClaim(o: OrderRow, why: string): void {
    const status = o.expires_ms > Date.now() ? ORDER_PENDING : ORDER_EXPIRED;
    this.db.run(
      'UPDATE orders SET claimed_txid = NULL, claim_ms = NULL, status = ?, note = ?, updated_ms = ? WHERE id = ?',
      status, why, Date.now(), o.id,
    );
  }

  /** Ties a transfer to an order (inside a transaction). */
  private link(o: OrderRow, t: Seen): void {
    this.db.run(
      'UPDATE orders SET txid = ?, paid_micro = ?, payer = ?, paid_tx_ms = ?, updated_ms = ? WHERE id = ?',
      t.txid, Number(t.value), t.from, t.blockMs, Date.now(), o.id,
    );
    this.db.run("UPDATE chain_transfers SET status = 'matched', order_id = ? WHERE txid = ?", o.id, t.txid);
  }

  private noteTransfer(txid: string, note: string): void {
    this.db.run('UPDATE chain_transfers SET note = ? WHERE txid = ?', note, txid);
  }

  private setStatus(o: OrderRow, status: string, note: string | null): void {
    if (o.status === status && !note) return;
    this.db.run('UPDATE orders SET status = ?, note = COALESCE(?, note), updated_ms = ? WHERE id = ?', status, note, Date.now(), o.id);
    if (status === ORDER_REVIEW || status === ORDER_PARTIAL) this.db.logEvent('attention', `Order ${ID8(o.id)} set aside for review: ${note}`, o.user_id);
  }

  private markPaid(o: OrderRow, by: string, note: string | null): OrderRow {
    const done = this.db.tx(() => {
      const fresh = this.byId(o.id)!;
      if (fresh.status === ORDER_PAID) return fresh;
      const lic = this.licences.grant(o.user_id, o.plan, 'order', o.id);
      const now = Date.now();
      this.db.run(
        'UPDATE orders SET status = ?, licence_id = ?, decided_by = ?, decided_ms = ?, note = COALESCE(?, note), updated_ms = ? WHERE id = ?',
        ORDER_PAID, lic.id, by, now, note, now, o.id,
      );
      const got = fresh.paid_micro ? ` (${fromMicro(fresh.paid_micro)} USDT received)` : '';
      this.db.logEvent('paid', `Payment confirmed for order ${ID8(o.id)}: ${o.amount} USDT${got}`, o.user_id);
      return this.byId(o.id)!;
    });
    this.roles.syncSoon(o.user_id);
    return done;
  }

  // ---------- owner actions

  /** Look at the blockchain again now (and at the transaction the buyer gave, if any). */
  async recheck(id: string, by: string): Promise<OrderRow> {
    const o = this.byId(id);
    if (!o) throw new NotFoundException();
    if (!this.tron.configured) throw new ServiceUnavailableException('No receiving address is set.');
    await this.poll();
    this.db.logEvent('recheck', `Payment of order ${ID8(id)} re-checked on the blockchain by the owner (${by})`, o.user_id);
    return this.byId(id)!;
  }

  /** Owner override, e.g. a short payment the owner accepts. */
  markPaidByOwner(id: string, adminId: string, note: string): OrderRow {
    const o = this.byId(id);
    if (!o) throw new NotFoundException();
    if (o.status === ORDER_PAID) throw new ConflictException('This order is already paid.');
    return this.markPaid(o, adminId, note || 'confirmed manually by the owner');
  }

  cancelByOwner(id: string, adminId: string): boolean {
    const o = this.byId(id);
    if (!o || o.status === ORDER_PAID || o.status === ORDER_CANCELLED) return false;
    this.db.run('UPDATE orders SET status = ?, decided_by = ?, decided_ms = ?, updated_ms = ? WHERE id = ?', ORDER_CANCELLED, adminId, Date.now(), Date.now(), id);
    this.db.logEvent('cancel', `Order ${ID8(id)} cancelled by the owner`, o.user_id);
    return true;
  }

  /** An unmatched payment the owner recognises: it pays that order (logged). */
  assignTransfer(txid: string, orderId: string, adminId: string): OrderRow {
    return this.db.tx(() => {
      const t = this.transfer(txid);
      if (!t) throw new NotFoundException('Unknown transaction.');
      if (t.status !== 'unmatched') throw new ConflictException('This payment is already matched or ignored.');
      // the member knows the 8-character order number; the full id works too
      const ref = orderId.toLowerCase();
      const found = this.db.all<OrderRow>("SELECT * FROM orders WHERE substr(id, 1, ?) = ? LIMIT 2", ref.length, ref);
      if (found.length !== 1) throw new NotFoundException(found.length ? 'Several orders start like this: enter the full id.' : 'Unknown order.');
      const o = found[0];
      if (o.status === ORDER_PAID) throw new ConflictException('This order is already paid.');
      if (o.txid) throw new ConflictException('This order already has a payment attached.');
      this.link(o, { txid, from: t.from_addr, value: BigInt(t.value_micro), blockMs: t.block_ms });
      this.db.run('UPDATE chain_transfers SET decided_by = ? WHERE txid = ?', adminId, txid);
      this.db.logEvent('assign', `Payment ${TX10(txid)} (${fromMicro(t.value_micro)} USDT) assigned to order ${ID8(o.id)} by the owner`, o.user_id);
      return this.markPaid(this.byId(o.id)!, adminId, `payment of ${fromMicro(t.value_micro)} USDT assigned by the owner`);
    });
  }

  ignoreTransfer(txid: string, adminId: string, note: string): boolean {
    const n = this.db.run(
      "UPDATE chain_transfers SET status = 'ignored', note = ?, decided_by = ? WHERE txid = ? AND status = 'unmatched'",
      note || 'set aside by the owner', adminId, txid,
    );
    if (n) this.db.logEvent('assign', `Payment ${TX10(txid)} set aside by the owner`);
    return n > 0;
  }

  /** Watcher state for the panel. */
  watcherState(): { lastOkAt: number | null; lastError: string | null; lastErrorAt: number | null; addressChangedAt: number | null } {
    const n = (k: string) => Number(this.db.getMeta(k)) || null;
    return {
      lastOkAt: n('tron_last_ok_ms'),
      lastError: this.db.getMeta('tron_last_error'),
      lastErrorAt: n('tron_last_error_ms'),
      addressChangedAt: n('tron_address_changed_ms'),
    };
  }

  // ---------- what the buyer sees

  view(o: OrderRow) {
    const payable = [ORDER_PENDING, ORDER_CONFIRMING, ORDER_EXPIRED].includes(o.status) && !!o.amount_micro && this.tron.configured;
    return {
      id: o.id,
      plan: o.plan,
      planLabel: this.licences.plan(o.plan)?.label ?? o.plan,
      amount: o.amount,
      currency: 'USDT',
      promoCode: o.promo_code ?? null,
      discountPct: o.discount_pct ?? 0,
      fullPrice: o.base_full_micro ? fromMicro(o.base_full_micro, 2) : null,
      status: o.status,
      createdAt: o.created_ms,
      expiresAt: o.expires_ms,
      paidAt: o.status === ORDER_PAID ? o.decided_ms : null,
      pay: payable
        ? { address: this.tron.address, amount: fromMicro(o.amount_micro, 4), network: 'TRON (TRC20)', token: 'USDT', contract: USDT_CONTRACT }
        : null,
      txid: o.txid ?? o.claimed_txid ?? null,
      received: o.paid_micro ? fromMicro(o.paid_micro) : null,
      canClaim: [ORDER_PENDING, ORDER_EXPIRED, ORDER_CONFIRMING].includes(o.status) && Date.now() - o.created_ms < CLAIM_MAX_AGE_MS,
    };
  }
}
