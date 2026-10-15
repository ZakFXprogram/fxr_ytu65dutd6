import { Inject, Injectable } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { CONFIG, type AppConfig } from '../config';
import { safeEqual } from '../common/util';

export interface Invoice {
  id: string;
  url: string;
}

export interface NpPayment {
  payment_id: string;
  invoice_id: string | null;
  payment_status: string;
  order_id: string | null;
  price_amount: number;
  price_currency: string;
  pay_currency: string | null;
  actually_paid: number | null;
}

/** Recursively sorts object keys, as NOWPayments does before signing a notification. */
function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    return Object.keys(v as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((o, k) => {
        o[k] = sortKeys((v as Record<string, unknown>)[k]);
        return o;
      }, {});
  }
  return v;
}

/**
 * NOWPayments (hosted crypto checkout). We create an invoice, the customer pays on their page, and they notify
 * us (IPN). Every notification is checked twice: its HMAC-SHA512 signature, then the payment is fetched back from
 * their API with our key and only that answer is trusted. This server never sees or holds any wallet key.
 */
@Injectable()
export class NowPaymentsClient {
  constructor(@Inject(CONFIG) private readonly cfg: AppConfig) {}

  get configured(): boolean {
    return !!(this.cfg.nowpayments.apiKey && this.cfg.nowpayments.ipnSecret);
  }

  async createInvoice(o: { orderId: string; amount: string; description: string }): Promise<Invoice> {
    const np = this.cfg.nowpayments;
    const base = this.cfg.publicUrl;
    const r = await fetch(`${np.apiBase}/invoice`, {
      method: 'POST',
      headers: { 'x-api-key': np.apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        price_amount: Number(o.amount),
        price_currency: 'usd',
        pay_currency: np.payCurrency,
        order_id: o.orderId,
        order_description: o.description,
        ipn_callback_url: `${base}/api/payments/nowpayments/ipn`,
        success_url: `${base}/checkout/${o.orderId}`,
        cancel_url: `${base}/checkout/${o.orderId}`,
        is_fixed_rate: true,
        is_fee_paid_by_user: false,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) throw new Error(`invoice failed (${r.status})`);
    const j = (await r.json()) as { id?: unknown; invoice_url?: unknown };
    const url = typeof j.invoice_url === 'string' ? j.invoice_url : '';
    if (j.id === undefined || j.id === null || !url) throw new Error('bad invoice response');
    if (this.cfg.production && !url.startsWith('https://')) throw new Error('bad invoice url');
    return { id: String(j.id), url };
  }

  /** The source of truth: the payment as NOWPayments reports it to an authenticated request. */
  async getPayment(paymentId: string): Promise<NpPayment> {
    const np = this.cfg.nowpayments;
    const r = await fetch(`${np.apiBase}/payment/${encodeURIComponent(paymentId)}`, {
      headers: { 'x-api-key': np.apiKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(2500),
    });
    if (!r.ok) throw new Error(`payment lookup failed (${r.status})`);
    const j = (await r.json()) as Record<string, unknown>;
    return {
      payment_id: String(j['payment_id'] ?? ''),
      invoice_id: j['invoice_id'] === null || j['invoice_id'] === undefined ? null : String(j['invoice_id']),
      payment_status: String(j['payment_status'] ?? ''),
      order_id: j['order_id'] === null || j['order_id'] === undefined ? null : String(j['order_id']),
      price_amount: Number(j['price_amount']),
      price_currency: String(j['price_currency'] ?? '').toLowerCase(),
      pay_currency: j['pay_currency'] ? String(j['pay_currency']).toLowerCase() : null,
      actually_paid: j['actually_paid'] === null || j['actually_paid'] === undefined ? null : Number(j['actually_paid']),
    };
  }

  /** HMAC-SHA512 of the body with keys sorted, compared in constant time. */
  verifySignature(body: unknown, signature: unknown): boolean {
    if (typeof signature !== 'string' || !/^[0-9a-fA-F]{128}$/.test(signature.trim())) return false;
    if (!body || typeof body !== 'object') return false;
    const want = createHmac('sha512', this.cfg.nowpayments.ipnSecret).update(JSON.stringify(sortKeys(body))).digest('hex');
    return safeEqual(signature.trim().toLowerCase(), want);
  }
}

/** Exported for tests and the local mock. */
export const sortForSignature = sortKeys;
