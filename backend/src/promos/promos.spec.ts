import { PromosService } from './promos.service';

class FakeDb {
  promos = new Map<string, any>();
  orders: any[] = [];
  events: string[] = [];
  run(sql: string, ...p: any[]): number {
    if (sql.includes('INSERT INTO promos')) {
      const [id, code, percent, kind, aff, maxUses, note, by, ms] = p;
      this.promos.set(id, { id, code, percent, kind, affiliate_user: aff, status: 'active', max_uses: maxUses, note, created_by: by, created_ms: ms });
      return 1;
    }
    if (sql.includes('UPDATE promos SET status')) {
      const [status, id] = p; const r = this.promos.get(id); if (r) { r.status = status; return 1; } return 0;
    }
    return 0;
  }
  get<T>(sql: string, ...p: any[]): any {
    if (sql.includes('FROM promos WHERE id')) return this.promos.get(p[0]);
    if (sql.includes('FROM promos WHERE code')) return [...this.promos.values()].find((r) => r.code === p[0]);
    if (sql.includes("COUNT(*) AS n FROM orders")) return { n: this.orders.filter((o) => o.promo_id === p[0] && o.status === 'paid').length };
    if (sql.includes('SUM(CASE WHEN status')) {
      const mine = this.orders.filter((o) => o.promo_id === p[0]);
      return { uses: mine.filter((o) => o.status === 'paid').length, pending: mine.filter((o) => o.status === 'pending').length, rev: mine.filter((o) => o.status === 'paid').reduce((s, o) => s + (o.base_micro ?? 0), 0) };
    }
    return undefined;
  }
  all<T>(sql: string): any[] { return [...this.promos.values()].sort((a, b) => b.created_ms - a.created_ms); }
  logEvent(_k: string, t: string) { this.events.push(t); }
}

describe('PromosService', () => {
  it('creates, validates and counts uses', () => {
    const db = new FakeDb();
    const svc = new PromosService(db as never);
    const p = svc.create({ code: 'black20', percent: 20, kind: 'promo', maxUses: 2 }, 'owner');
    expect(p.code).toBe('BLACK20');
    expect(p.percent).toBe(20);

    // validate
    const ok = svc.usable('black20');
    expect('promo' in ok).toBe(true);
    expect((svc.usable('nope') as any).error).toBeTruthy();

    // reject bad percent and duplicate code
    expect(() => svc.create({ code: 'x', percent: 200 }, 'o')).toThrow();
    expect(() => svc.create({ code: 'BLACK20', percent: 10 }, 'o')).toThrow();

    // uses = paid orders; max_uses stops it
    db.orders.push({ promo_id: p.id, status: 'paid', base_micro: 6_400_000 });
    db.orders.push({ promo_id: p.id, status: 'paid', base_micro: 6_400_000 });
    expect(svc.usesPaid(p.id)).toBe(2);
    expect((svc.usable('black20') as any).error).toContain('limit');

    const list = svc.list();
    expect(list[0].uses).toBe(2);
    expect(list[0].revenueUsdt).toBeCloseTo(12.8, 2);

    // auto-generated code when none given
    const a = svc.create({ percent: 15, kind: 'affiliate', affiliateUser: '367247878382419970' }, 'owner');
    expect(a.code.startsWith('AFF-')).toBe(true);
    expect(a.kind).toBe('affiliate');
  });
});
