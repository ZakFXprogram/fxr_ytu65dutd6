import { BadRequestException, Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { DbService, newId } from '../db/db.service';

export type PromoKind = 'promo' | 'affiliate';

export interface PromoRow {
  id: string;
  code: string;
  percent: number;
  kind: PromoKind;
  affiliate_user: string | null;
  status: 'active' | 'disabled';
  max_uses: number;
  note: string | null;
  created_by: string;
  created_ms: number;
}

export interface PromoView extends PromoRow {
  uses: number; // paid orders that used it
  pending: number; // orders in progress with it
  revenueUsdt: number; // total paid (discounted) revenue it brought
}

const CODE_OK = /^[A-Z0-9][A-Z0-9-]{1,23}$/; // 2..24 chars, A-Z 0-9 and dashes
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Promo & affiliate codes: a percentage off the plan price at checkout. Unlike redeem keys (which hand out a
 * free licence, single use), a promo is reusable and only discounts the price; its "uses" is the number of
 * orders actually paid with it. An affiliate code is the same with a kind that ties it to a partner, so the
 * owner can see how many sales each partner brought.
 */
@Injectable()
export class PromosService {
  constructor(private readonly db: DbService) {}

  static normalize(raw: string): string {
    return (raw ?? '').trim().toUpperCase().replace(/\s+/g, '');
  }

  private static randomCode(kind: PromoKind): string {
    const g = (n: number) => Array.from({ length: n }, () => ALPHA[randomInt(ALPHA.length)]).join('');
    return `${kind === 'affiliate' ? 'AFF' : 'FXR'}-${g(5)}`;
  }

  create(input: {
    code?: string;
    percent: number;
    kind?: PromoKind;
    affiliateUser?: string;
    maxUses?: number;
    note?: string;
  }, by: string): PromoRow {
    const kind: PromoKind = input.kind === 'affiliate' ? 'affiliate' : 'promo';
    const percent = Math.round(input.percent);
    if (!(percent >= 1 && percent <= 90)) throw new BadRequestException('The discount must be between 1% and 90%.');
    const maxUses = Math.max(0, Math.round(input.maxUses ?? 0));

    let code = PromosService.normalize(input.code || '');
    if (!code) {
      do {
        code = PromosService.randomCode(kind);
      } while (this.byCode(code));
    } else {
      if (!CODE_OK.test(code)) throw new BadRequestException('A code is 2 to 24 characters: letters, digits and dashes.');
      if (this.byCode(code)) throw new BadRequestException('That code already exists.');
    }

    const id = newId();
    this.db.run(
      `INSERT INTO promos(id, code, percent, kind, affiliate_user, status, max_uses, note, created_by, created_ms)
       VALUES (?,?,?,?,?,'active',?,?,?,?)`,
      id, code, percent, kind, input.affiliateUser || null, maxUses, (input.note ?? '').trim() || null, by, Date.now(),
    );
    this.db.logEvent('promo', `Promo ${code} created (${percent}% off, ${kind}${maxUses ? `, max ${maxUses}` : ''}) by ${by}`);
    return this.byId(id)!;
  }

  byId(id: string): PromoRow | undefined {
    return this.db.get<PromoRow>('SELECT * FROM promos WHERE id = ?', id);
  }

  byCode(code: string): PromoRow | undefined {
    return this.db.get<PromoRow>('SELECT * FROM promos WHERE code = ?', PromosService.normalize(code));
  }

  /** Paid orders that used a promo (its real "uses"). */
  usesPaid(promoId: string): number {
    return this.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM orders WHERE promo_id = ? AND status = 'paid'", promoId)!.n;
  }

  /** The active promo for this code, usable right now, or a reason why not. */
  usable(code: string): { promo: PromoRow } | { error: string } {
    const p = this.byCode(code);
    if (!p || p.status !== 'active') return { error: 'This promo code is not valid.' };
    if (p.max_uses > 0 && this.usesPaid(p.id) >= p.max_uses) return { error: 'This promo code has reached its limit.' };
    return { promo: p };
  }

  list(): PromoView[] {
    const rows = this.db.all<PromoRow>('SELECT * FROM promos ORDER BY created_ms DESC');
    return rows.map((p) => {
      const agg = this.db.get<{ uses: number; pending: number; rev: number }>(
        `SELECT
           SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) AS uses,
           SUM(CASE WHEN status IN ('pending','confirming') THEN 1 ELSE 0 END) AS pending,
           COALESCE(SUM(CASE WHEN status = 'paid' THEN base_micro ELSE 0 END), 0) AS rev
         FROM orders WHERE promo_id = ?`,
        p.id,
      )!;
      return { ...p, uses: agg.uses ?? 0, pending: agg.pending ?? 0, revenueUsdt: Math.round((agg.rev ?? 0) / 1e4) / 100 };
    });
  }

  setStatus(id: string, status: 'active' | 'disabled', by: string): boolean {
    const n = this.db.run('UPDATE promos SET status = ? WHERE id = ?', status, id);
    if (n) this.db.logEvent('promo', `Promo ${this.byId(id)?.code ?? id} ${status === 'disabled' ? 'disabled' : 're-enabled'} by ${by}`);
    return n > 0;
  }
}
