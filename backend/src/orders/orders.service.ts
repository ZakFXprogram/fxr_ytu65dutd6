import {
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { CONFIG, type AppConfig } from '../config';
import { DbService, newId } from '../db/db.service';
import { LicencesService } from '../licences/licences.service';

export interface OrderRow {
  id: string;
  user_id: string;
  plan: string;
  amount: string; // exact USDT amount asked, e.g. "8.37"
  pay_to: string; // receiving address shown to the customer for this order
  status: string;
  txid: string | null;
  licence_id: string | null;
  note: string | null;
  decided_by: string | null;
  created_ms: number;
  expires_ms: number;
  submitted_ms: number | null;
  decided_ms: number | null;
  updated_ms: number;
}

export const ORDER_PENDING = 'pending'; // waiting for the customer to pay and paste the transaction id
export const ORDER_SUBMITTED = 'submitted'; // transaction id received, waiting for the owner's check
export const ORDER_PAID = 'paid';
export const ORDER_REJECTED = 'rejected';
export const ORDER_EXPIRED = 'expired';
export const ORDER_CANCELLED = 'cancelled';

const MAX_OPEN_ORDERS = 3;
const TXID = /^[0-9a-f]{64}$/;

/**
 * Built-in USDT (TRC20) checkout, no payment provider:
 *  1. a signed-in member opens an order; it gets a unique amount (plan price + unique cents) so two open orders
 *     never ask for the same amount;
 *  2. the member sends that exact amount to the public receiving address and pastes the transaction id;
 *  3. the owner checks it on a block explorer from the panel and confirms; the licence is granted at once.
 * A transaction id can be attached to one order only (UNIQUE), and the unique amount stops anyone from claiming
 * somebody else's payment they saw on the public ledger.
 */
@Injectable()
export class OrdersService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly db: DbService,
    private readonly licences: LicencesService,
    @Inject(CONFIG) private readonly cfg: AppConfig,
  ) {}

  onModuleInit(): void {
    this.sweep();
    this.timer = setInterval(() => this.sweep(), 5 * 60_000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  sweep(): void {
    const now = Date.now();
    this.db.run('UPDATE orders SET status = ?, updated_ms = ? WHERE status = ? AND expires_ms <= ?', ORDER_EXPIRED, now, ORDER_PENDING, now);
  }

  byId(id: string): OrderRow | undefined {
    return this.db.get<OrderRow>('SELECT * FROM orders WHERE id = ?', id);
  }

  /** Orders are only visible to their owner: someone else's id answers 404, same as a missing one. */
  mine(id: string, userId: string): OrderRow {
    this.sweep();
    const o = this.byId(id);
    if (!o || o.user_id !== userId) throw new NotFoundException();
    return o;
  }

  forUser(userId: string): OrderRow[] {
    this.sweep();
    return this.db.all<OrderRow>('SELECT * FROM orders WHERE user_id = ? ORDER BY created_ms DESC LIMIT 50', userId);
  }

  create(userId: string, planId: string): OrderRow {
    const plan = this.licences.plan(planId);
    if (!plan) throw new NotFoundException('Unknown plan');
    if (!this.cfg.payAddress) throw new ServiceUnavailableException('Payments are not open yet. Please try again later.');
    this.sweep();
    const now = Date.now();

    // re-opening the same plan returns the order already waiting for payment
    const same = this.db.get<OrderRow>(
      'SELECT * FROM orders WHERE user_id = ? AND plan = ? AND status = ? ORDER BY created_ms DESC LIMIT 1',
      userId, planId, ORDER_PENDING,
    );
    if (same) return same;

    const open = this.db.get<{ n: number }>(
      'SELECT COUNT(*) AS n FROM orders WHERE user_id = ? AND status IN (?, ?)',
      userId, ORDER_PENDING, ORDER_SUBMITTED,
    )!.n;
    if (open >= MAX_OPEN_ORDERS) {
      throw new HttpException('You already have open orders. Finish or cancel one first.', HttpStatus.TOO_MANY_REQUESTS);
    }

    return this.db.tx(() => {
      const id = newId();
      const amount = this.uniqueAmount(plan.price);
      this.db.run(
        `INSERT INTO orders(id,user_id,plan,amount,pay_to,status,txid,licence_id,note,decided_by,created_ms,expires_ms,submitted_ms,decided_ms,updated_ms)
         VALUES (?,?,?,?,?,?,NULL,NULL,NULL,NULL,?,?,NULL,NULL,?)`,
        id, userId, planId, amount, this.cfg.payAddress, ORDER_PENDING, now, now + this.cfg.orderTtlHours * 3600_000, now,
      );
      this.db.logEvent('order', `order ${id} opened by ${userId}: ${planId} for ${amount} USDT`);
      return this.byId(id)!;
    });
  }

  /** Plan price plus cents that no other open order uses, e.g. 8 -> "8.37". */
  private uniqueAmount(price: number): string {
    const used = new Set(
      this.db
        .all<{ amount: string }>('SELECT amount FROM orders WHERE status IN (?, ?)', ORDER_PENDING, ORDER_SUBMITTED)
        .map((r) => r.amount),
    );
    for (let i = 0; i < 200; i++) {
      const a = `${price}.${String(randomInt(1, 100)).padStart(2, '0')}`;
      if (!used.has(a)) return a;
    }
    for (let i = 0; i < 2000; i++) {
      const a = `${price}.${String(randomInt(1, 1000)).padStart(3, '0')}`;
      if (!used.has(a)) return a;
    }
    throw new ServiceUnavailableException('Too many open orders right now. Please try again in a few minutes.');
  }

  submitTxid(id: string, userId: string, rawTxid: string): OrderRow {
    const o = this.mine(id, userId);
    if (o.status === ORDER_EXPIRED) throw new ConflictException('This order expired. If you already paid, contact support with your transaction ID.');
    if (o.status !== ORDER_PENDING) throw new ConflictException('This order is not waiting for a payment.');
    const txid = rawTxid.trim().toLowerCase();
    if (!TXID.test(txid)) throw new ConflictException('A TRON transaction ID is 64 characters (0-9, a-f).');
    if (this.db.get('SELECT id FROM orders WHERE txid = ?', txid)) {
      throw new ConflictException('This transaction ID was already submitted.');
    }
    const now = Date.now();
    try {
      this.db.run(
        'UPDATE orders SET txid = ?, status = ?, submitted_ms = ?, updated_ms = ? WHERE id = ? AND status = ?',
        txid, ORDER_SUBMITTED, now, now, id, ORDER_PENDING,
      );
    } catch {
      throw new ConflictException('This transaction ID was already submitted.'); // UNIQUE race
    }
    this.db.logEvent('payment', `order ${id}: transaction id submitted by ${userId}`);
    return this.byId(id)!;
  }

  cancel(id: string, userId: string): OrderRow {
    const o = this.mine(id, userId);
    if (o.status !== ORDER_PENDING) throw new ConflictException('Only an unpaid order can be cancelled.');
    this.db.run('UPDATE orders SET status = ?, updated_ms = ? WHERE id = ?', ORDER_CANCELLED, Date.now(), id);
    return this.byId(id)!;
  }

  // ---------- owner (panel)

  confirm(id: string, adminId: string): OrderRow {
    return this.db.tx(() => {
      const o = this.byId(id);
      if (!o) throw new NotFoundException();
      if (o.status !== ORDER_SUBMITTED) throw new ConflictException('Only a submitted payment can be confirmed.');
      const lic = this.licences.grant(o.user_id, o.plan, 'order', o.id);
      const now = Date.now();
      this.db.run(
        'UPDATE orders SET status = ?, licence_id = ?, decided_by = ?, decided_ms = ?, updated_ms = ? WHERE id = ?',
        ORDER_PAID, lic.id, adminId, now, now, id,
      );
      this.db.logEvent('confirm', `order ${id} (${o.amount} USDT) confirmed by ${adminId} -> licence ${lic.id}`);
      return this.byId(id)!;
    });
  }

  reject(id: string, adminId: string, note: string): OrderRow {
    const o = this.byId(id);
    if (!o) throw new NotFoundException();
    if (o.status !== ORDER_SUBMITTED && o.status !== ORDER_PENDING) throw new ConflictException('This order is already closed.');
    const now = Date.now();
    this.db.run(
      'UPDATE orders SET status = ?, note = ?, decided_by = ?, decided_ms = ?, updated_ms = ? WHERE id = ?',
      ORDER_REJECTED, note.slice(0, 200) || null, adminId, now, now, id,
    );
    this.db.logEvent('reject', `order ${id} rejected by ${adminId}`);
    return this.byId(id)!;
  }

  forAdmin(): OrderRow[] {
    this.sweep();
    return this.db.all<OrderRow>(
      `SELECT * FROM orders ORDER BY (status = ?) DESC, COALESCE(submitted_ms, created_ms) DESC LIMIT 200`,
      ORDER_SUBMITTED,
    );
  }

  view(o: OrderRow) {
    return {
      id: o.id,
      plan: o.plan,
      planLabel: this.licences.plan(o.plan)?.label ?? o.plan,
      amount: o.amount,
      token: 'USDT',
      network: 'TRON (TRC20)',
      payTo: o.pay_to,
      status: o.status,
      txid: o.txid,
      note: o.note,
      createdAt: o.created_ms,
      expiresAt: o.expires_ms,
      submittedAt: o.submitted_ms,
      decidedAt: o.decided_ms,
    };
  }
}
