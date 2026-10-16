import {
  BadGatewayException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DbService, newId } from '../db/db.service';
import { LicencesService } from '../licences/licences.service';
import { NowPaymentsClient, type NpPayment } from '../payments/nowpayments.client';
import { RoleSyncService } from '../roles/role-sync.service';

export interface OrderRow {
  id: string;
  user_id: string;
  plan: string;
  amount: string; // price in USD (= USDT), e.g. "8.00"
  status: string;
  licence_id: string | null;
  note: string | null;
  decided_by: string | null;
  created_ms: number;
  expires_ms: number;
  decided_ms: number | null;
  updated_ms: number;
  invoice_id: string | null;
  invoice_url: string | null;
  payment_id: string | null;
  pay_currency: string | null;
  paid_amount: string | null;
  provider_status: string | null;
}

export const ORDER_PENDING = 'pending'; // invoice created, waiting for the customer
export const ORDER_CONFIRMING = 'confirming'; // payment seen, waiting for confirmations
export const ORDER_PAID = 'paid';
export const ORDER_PARTIAL = 'partially_paid'; // customer sent less than asked: owner decides
export const ORDER_REVIEW = 'review'; // anything that does not match (amount, currency, invoice): owner decides
export const ORDER_FAILED = 'failed';
export const ORDER_EXPIRED = 'expired';
export const ORDER_CANCELLED = 'cancelled';
export const ORDER_REFUNDED = 'refunded';

const OPEN = [ORDER_PENDING, ORDER_CONFIRMING];
const MAX_OPEN_ORDERS = 3;
const INVOICE_REUSE_MS = 60 * 60_000;
const ORDER_TTL_MS = 24 * 3600_000;

/**
 * Checkout through NOWPayments' hosted page: no address to copy, no transaction id to paste. The licence is
 * granted only when NOWPayments' own API (queried with our key) says the payment for THIS order is "finished"
 * for the right amount. Notifications that arrive while their API is unreachable are re-checked by a
 * reconcile loop every 2 minutes.
 */
@Injectable()
export class OrdersService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Orders');
  private timers: NodeJS.Timeout[] = [];

  constructor(
    private readonly db: DbService,
    private readonly licences: LicencesService,
    private readonly np: NowPaymentsClient,
    private readonly roles: RoleSyncService,
  ) {}

  onModuleInit(): void {
    this.sweep();
    const t1 = setInterval(() => this.sweep(), 5 * 60_000);
    const t2 = setInterval(() => void this.reconcile(), 2 * 60_000);
    t1.unref();
    t2.unref();
    this.timers.push(t1, t2);
  }

  onModuleDestroy(): void {
    this.timers.forEach(clearInterval);
  }

  /** Orders nobody started paying expire after 24 hours. */
  sweep(): void {
    const now = Date.now();
    this.db.run(
      'UPDATE orders SET status = ?, updated_ms = ? WHERE status = ? AND payment_id IS NULL AND expires_ms <= ?',
      ORDER_EXPIRED, now, ORDER_PENDING, now,
    );
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

  async create(userId: string, planId: string): Promise<OrderRow> {
    const plan = this.licences.plan(planId);
    if (!plan) throw new NotFoundException('Unknown plan');
    if (!this.np.configured) throw new ServiceUnavailableException('Checkout is not open yet. Please try again later.');
    this.sweep();
    const now = Date.now();

    // clicking "Buy" twice reuses the fresh invoice instead of creating a new one
    const same = this.db.get<OrderRow>(
      `SELECT * FROM orders WHERE user_id = ? AND plan = ? AND status = ? AND payment_id IS NULL
         AND invoice_url IS NOT NULL AND created_ms > ? ORDER BY created_ms DESC LIMIT 1`,
      userId, planId, ORDER_PENDING, now - INVOICE_REUSE_MS,
    );
    if (same) return same;

    const open = this.db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM orders WHERE user_id = ? AND status IN (${OPEN.map(() => '?').join(',')})`,
      userId, ...OPEN,
    )!.n;
    if (open >= MAX_OPEN_ORDERS) {
      throw new HttpException('You already have payments in progress. Finish or cancel one first.', HttpStatus.TOO_MANY_REQUESTS);
    }

    const id = newId();
    const amount = plan.price.toFixed(2);
    this.db.run(
      `INSERT INTO orders(id,user_id,plan,amount,pay_to,status,created_ms,expires_ms,updated_ms,terms_ms) VALUES (?,?,?,?,'',?,?,?,?,?)`,
      id, userId, planId, amount, ORDER_PENDING, now, now + ORDER_TTL_MS, now, now,
    );
    try {
      const inv = await this.np.createInvoice({ orderId: id, amount, description: `FXR OrderFlow - ${plan.label}` });
      this.db.run('UPDATE orders SET invoice_id = ?, invoice_url = ?, updated_ms = ? WHERE id = ?', inv.id, inv.url, Date.now(), id);
    } catch (e) {
      this.log.warn(`invoice for ${id} failed: ${(e as Error).message}`);
      this.db.run('UPDATE orders SET status = ?, note = ?, updated_ms = ? WHERE id = ?', ORDER_FAILED, 'payment page could not be created', Date.now(), id);
      throw new BadGatewayException('The payment page could not be created. Please try again in a minute.');
    }
    this.db.logEvent('order', `Order ${id.slice(0, 8).toUpperCase()} opened: ${plan.label}, ${amount} USD`, userId);
    return this.byId(id)!;
  }

  cancel(id: string, userId: string): OrderRow {
    const o = this.mine(id, userId);
    if (o.status !== ORDER_PENDING || o.payment_id) throw new ConflictException('Only an order that has not been paid can be cancelled.');
    this.db.run('UPDATE orders SET status = ?, updated_ms = ? WHERE id = ?', ORDER_CANCELLED, Date.now(), id);
    return this.byId(id)!;
  }

  // ---------- payment notifications

  /** NOWPayments IPN. Returns quickly; anything not confirmed now is picked up by the reconcile loop. */
  async handleIpn(body: Record<string, unknown>, signature: unknown, raw?: Buffer): Promise<void> {
    if (!this.np.verifySignature(body, signature, raw)) throw new HttpException('bad signature', HttpStatus.UNAUTHORIZED);
    const orderId = String(body['order_id'] ?? '');
    const paymentId = String(body['payment_id'] ?? '');
    const o = /^[0-9a-f]{24}$/.test(orderId) ? this.byId(orderId) : undefined;
    if (!o || !/^\d{1,20}$/.test(paymentId)) {
      this.log.warn(`IPN for unknown order ${orderId.slice(0, 32)}`);
      return;
    }
    if (o.status === ORDER_PAID) return;
    // remember which payment belongs to the order so the reconcile loop can query it
    this.db.run(
      'UPDATE orders SET payment_id = COALESCE(payment_id, ?), provider_status = ?, updated_ms = ? WHERE id = ?',
      paymentId, String(body['payment_status'] ?? '').slice(0, 32), Date.now(), o.id,
    );
    try {
      const p = await this.np.getPayment(paymentId);
      this.apply(this.byId(o.id)!, p, 'nowpayments');
    } catch (e) {
      this.log.warn(`payment ${paymentId} lookup failed, will retry: ${(e as Error).message}`);
    }
  }

  async reconcile(): Promise<void> {
    if (!this.np.configured) return;
    const rows = this.db.all<OrderRow>(
      `SELECT * FROM orders WHERE payment_id IS NOT NULL AND status IN (?,?,?) AND created_ms > ? LIMIT 50`,
      ORDER_PENDING, ORDER_CONFIRMING, ORDER_PARTIAL, Date.now() - 7 * 86400_000,
    );
    for (const o of rows) {
      try {
        this.apply(o, await this.np.getPayment(o.payment_id!), 'nowpayments');
      } catch (e) {
        this.log.warn(`reconcile ${o.id}: ${(e as Error).message}`);
      }
    }
  }

  /** Owner: ask NOWPayments again now. */
  async recheck(id: string, by: string): Promise<OrderRow> {
    const o = this.byId(id);
    if (!o) throw new NotFoundException();
    if (!o.payment_id) throw new ConflictException('No payment has been started for this order yet.');
    this.apply(o, await this.np.getPayment(o.payment_id), 'nowpayments');
    this.db.logEvent('recheck', `Payment of order ${id.slice(0, 8).toUpperCase()} re-checked with NOWPayments by the owner`, o.user_id);
    return this.byId(id)!;
  }

  /** Applies the payment status reported by NOWPayments' API. Idempotent. */
  private apply(o: OrderRow, p: NpPayment, by: string): void {
    if (o.status === ORDER_PAID) return;
    const now = Date.now();
    const mismatch =
      (p.order_id !== null && p.order_id !== o.id) ||
      (o.invoice_id !== null && p.invoice_id !== null && p.invoice_id !== o.invoice_id) ||
      (o.payment_id !== null && p.payment_id !== o.payment_id);
    this.db.run(
      'UPDATE orders SET provider_status = ?, pay_currency = ?, paid_amount = ?, updated_ms = ? WHERE id = ?',
      p.payment_status.slice(0, 32), p.pay_currency, p.actually_paid === null ? null : String(p.actually_paid), now, o.id,
    );
    if (mismatch) {
      this.setStatus(o, ORDER_REVIEW, 'payment does not belong to this order');
      return;
    }
    switch (p.payment_status) {
      case 'finished': {
        const amountOk = p.price_currency === 'usd' && Math.abs(p.price_amount - Number(o.amount)) < 0.005;
        if (!amountOk) {
          this.setStatus(o, ORDER_REVIEW, `price mismatch (${p.price_amount} ${p.price_currency})`);
          return;
        }
        this.markPaid(o, by, null);
        return;
      }
      case 'partially_paid':
        this.setStatus(o, ORDER_PARTIAL, 'customer sent less than the invoice amount');
        return;
      case 'confirming':
      case 'confirmed':
      case 'sending':
        this.setStatus(o, ORDER_CONFIRMING, null);
        return;
      case 'failed':
        this.setStatus(o, ORDER_FAILED, null);
        return;
      case 'expired':
        this.setStatus(o, ORDER_EXPIRED, null);
        return;
      case 'refunded':
        this.setStatus(o, ORDER_REFUNDED, null);
        return;
      default:
        return; // waiting: nothing to do
    }
  }

  private setStatus(o: OrderRow, status: string, note: string | null): void {
    if (o.status === status) return;
    this.db.run('UPDATE orders SET status = ?, note = COALESCE(?, note), updated_ms = ? WHERE id = ?', status, note, Date.now(), o.id);
    if (status === ORDER_REVIEW || status === ORDER_PARTIAL) this.db.logEvent('attention', `Order ${o.id.slice(0, 8).toUpperCase()} set aside for review: ${note}`, o.user_id);
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
      this.db.logEvent('paid', `Payment confirmed for order ${o.id.slice(0, 8).toUpperCase()} (${o.amount} USD)`, o.user_id);
      return this.byId(o.id)!;
    });
    this.roles.syncSoon(o.user_id);
    return done;
  }

  /** Owner override, e.g. a partial payment the owner accepts. */
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
    this.db.logEvent('cancel', `Order ${id.slice(0, 8).toUpperCase()} cancelled by the owner`, o.user_id);
    return true;
  }

  /** What the member sees. */
  view(o: OrderRow) {
    const payable = o.status === ORDER_PENDING && !!o.invoice_url;
    return {
      id: o.id,
      plan: o.plan,
      planLabel: this.licences.plan(o.plan)?.label ?? o.plan,
      amount: o.amount,
      currency: 'USD',
      payCurrency: o.pay_currency,
      status: o.status,
      checkoutUrl: payable ? o.invoice_url : null,
      createdAt: o.created_ms,
      paidAt: o.status === ORDER_PAID ? o.decided_ms : null,
    };
  }
}
