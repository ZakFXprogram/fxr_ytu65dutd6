// In-browser stand-in for the NestJS API, used only by the preview build. Mirrors the real endpoints' shapes and
// is seeded with clearly fictional sample data so the panel can be seen at volume. Nothing leaves the browser.
import { HttpErrorResponse, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { Observable, of, throwError, timer } from 'rxjs';
import { mergeMap } from 'rxjs/operators';

type Persona = 'visitor' | 'member' | 'owner';
interface User { id: string; name: string; username: string; banned: boolean; owner: boolean; joined: number; lastLogin: number; role: boolean; inServer: boolean | null }
interface Lic { id: string; userId: string; plan: string; status: string; start: number; end: number; machine: boolean; keySet: number; moved: number; lastSeen: number | null; source: string }
interface Ord { id: string; userId: string; plan: string; amount: string; status: string; expected: number; received: number | null; txid: string | null; claimedTxid: string | null; payer: string | null; paidTx: number | null; expires: number; note: string | null; created: number; updated: number; paidAt: number | null; decidedBy: string | null }
interface Tr { txid: string; from: string; value: number; at: number; status: 'matched' | 'unmatched' | 'ignored'; orderId: string | null; note: string | null; seen: number; decidedBy: string | null }
interface Code { id: string; hint: string; raw: string; plan: string; days: number; status: string; batch: string | null; created: number; usedBy: string | null; usedAt: number | null }
interface Ev { id: number; at: number; kind: string; text: string; userId: string | null }
interface Sess { id: string; userId: string; device: string; created: number; lastSeen: number; expires: number; current: boolean }

const DAY = 86400_000;
const now = () => Date.now();
const PLANS = [
  { id: 'month1', label: 'Monthly', price: 8, days: 30 },
  { id: 'month3', label: '3 months', price: 24, days: 90 },
  { id: 'month6', label: '6 months', price: 48, days: 180 },
  { id: 'year1', label: '1 year', price: 96, days: 365 },
  { id: 'lifetime', label: 'Lifetime', price: 67, days: 0 },
];
const plan = (p: string) => PLANS.find((x) => x.id === p);
const OWNER = '111111111111111111';
const ME = '333333333333333333';
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// deterministic sample data
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)];
const hex = (n: number) => Array.from({ length: n * 2 }, () => '0123456789abcdef'[Math.floor(rnd() * 16)]).join('');
const id = () => hex(12);
/** Deliberately NOT a valid TRON address (0 and O are not base58): no wallet accepts it, nothing can be sent to it. */
export const DEMO_ADDRESS = 'TDEMO0NLY0NOT0A0REAL0ADDRESS000000';
const USDT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const fakeWallet = () => 'T' + Array.from({ length: 33 }, () => B58[Math.floor(rnd() * 58)]).join('');
const usdt = (m: number | null, dp = 2) => {
  if (m === null) return null;
  let f = String(m % 1_000_000).padStart(6, '0').replace(/0+$/, '');
  if (f.length < dp) f = f.padEnd(dp, '0');
  return `${Math.floor(m / 1_000_000)}.${f}`;
};
const group = () => Array.from({ length: 4 }, () => ALPHA[Math.floor(Math.random() * 32)]).join('');

class Store {
  persona: Persona = 'visitor';
  panelPath = 'owner-panel';
  users: User[] = [];
  lics: Lic[] = [];
  orders: Ord[] = [];
  transfers: Tr[] = [];
  codes: Code[] = [];
  events: Ev[] = [];
  sessions: Sess[] = [];
  private evId = 1;

  constructor() {
    const t = now();
    this.users.push({ id: OWNER, name: 'You (owner)', username: 'owner', banned: false, owner: true, joined: t - 90 * DAY, lastLogin: t - 3600_000, role: true, inServer: true });
    this.users.push({ id: ME, name: 'Demo member', username: 'demo_member', banned: false, owner: false, joined: t - 600_000, lastLogin: t - 600_000, role: false, inServer: true });
    const handles = ['tape_reader', 'nq_scalper', 'es_auction', 'deltaflow', 'mbo_hunter', 'vwap_kid', 'orderbook_owl', 'absorb', 'leg2leg', 'poc_rider', 'ib_break', 'rth_open', 'globex', 'microES', 'tickstack', 'bidask', 'sweeper', 'iceberg', 'printwatch', 'footprint'];
    for (let i = 0; i < 46; i++) {
      const h = `${pick(handles)}${i}`;
      const joined = t - Math.floor(rnd() * 80) * DAY - Math.floor(rnd() * DAY);
      this.users.push({ id: String(500000000000000000 + i * 7919), name: h.replace(/_/g, ' '), username: h, banned: i === 13, owner: false, joined, lastLogin: Math.min(t, joined + Math.floor(rnd() * 20) * DAY), role: false, inServer: rnd() > 0.1 });
    }
    // orders over the last 30 days, most paid
    const members = this.users.filter((u) => !u.owner && u.id !== ME);
    for (let i = 0; i < 74; i++) {
      const u = pick(members);
      const p = pick(['month1', 'month1', 'month1', 'month3', 'month3', 'month6', 'year1', 'lifetime', 'lifetime']);
      const created = t - Math.floor(rnd() * 30) * DAY - Math.floor(rnd() * DAY);
      const roll = rnd();
      const status = i < 2 ? 'partially_paid' : i < 3 ? 'review' : i < 6 ? 'pending' : roll < 0.08 ? 'expired' : roll < 0.12 ? 'cancelled' : 'paid';
      const price = plan(p)!.price;
      const expected = this.uniqueAmount(price);
      const paidLike = status === 'paid' || status === 'partially_paid' || status === 'review';
      const viaClaim = status === 'paid' && rnd() < 0.15;
      const received = status === 'paid' ? (viaClaim ? price * 1_000_000 : expected) : status === 'partially_paid' ? (price - 1.5) * 1_000_000 : status === 'review' ? expected : null;
      const expires = status === 'pending' ? t + 20 * 60_000 : created + 30 * 60_000;
      const o: Ord = {
        id: id(), userId: u.id, plan: p, amount: price.toFixed(2), status: status === 'pending' ? 'pending' : status,
        expected, received, txid: paidLike ? hex(32) : null, claimedTxid: null, payer: paidLike ? fakeWallet() : null,
        paidTx: paidLike ? created + 300_000 : null, expires,
        note: status === 'partially_paid' ? `received ${(price - 1.5).toFixed(2)} USDT of ${price.toFixed(2)}` : status === 'review' ? 'paid after it was cancelled' : viaClaim ? 'matched by transaction id' : null,
        created: status === 'pending' ? t - 10 * 60_000 : created, updated: created + 600_000, paidAt: status === 'paid' ? created + 360_000 : null, decidedBy: status === 'paid' ? 'blockchain' : null,
      };
      if (o.txid) this.transfers.push({ txid: o.txid, from: o.payer!, value: o.received!, at: o.paidTx!, status: 'matched', orderId: o.id, note: null, seen: o.paidTx! + 20_000, decidedBy: null });
      this.orders.push(o);
      if (status === 'paid') this.grant(u.id, p, 'order', o.paidAt!, false);
    }
    this.orders.sort((a, b) => b.created - a.created);
    for (const [v, ago] of [[24_000_000, 2 * 3600_000], [13_370_000, 26 * 3600_000], [8_000_000, 3 * DAY]] as const) {
      this.transfers.push({ txid: hex(32), from: fakeWallet(), value: v, at: t - ago, status: 'unmatched', orderId: null, note: null, seen: t - ago + 20_000, decidedBy: null });
    }
    this.transfers.sort((a, b) => b.at - a.at);
    for (const u of this.users) u.role = this.active(u.id) && u.inServer !== false;
    // a few redeem keys
    for (let i = 0; i < 12; i++) {
      const used = i < 5;
      const by = used ? pick(members).id : null;
      this.codes.push({ id: id(), hint: group(), raw: '', plan: i < 8 ? 'month1' : 'month3', days: i < 8 ? 30 : 90, status: i === 11 ? 'disabled' : used ? 'used' : 'unused', batch: i < 8 ? 'giveaway-september' : 'partner-alpha', created: t - 20 * DAY, usedBy: by, usedAt: used ? t - (15 - i) * DAY : null });
    }
    // activity
    for (const o of [...this.orders].reverse()) {
      this.log('order', `Order ${o.id.slice(0, 8).toUpperCase()} opened: ${plan(o.plan)!.label}, ${usdt(o.expected, 4)} USDT`, o.userId, o.created);
      if (o.status === 'paid') this.log('paid', `Payment confirmed for order ${o.id.slice(0, 8).toUpperCase()}: ${o.amount} USDT (${usdt(o.received)} USDT received)`, o.userId, o.paidAt!);
      if (o.status === 'partially_paid' || o.status === 'review') this.log('attention', `Order ${o.id.slice(0, 8).toUpperCase()} set aside for review: ${o.note}`, o.userId, o.updated);
    }
    this.events.sort((a, b) => b.at - a.at);
    this.sessions.push(
      { id: hex(8), userId: ME, device: 'Chrome on Windows', created: t - 600_000, lastSeen: t, expires: t + 7 * DAY, current: true },
      { id: hex(8), userId: ME, device: 'Safari on iPhone', created: t - 2 * DAY, lastSeen: t - 5 * 3600_000, expires: t + 5 * DAY, current: false },
      { id: hex(8), userId: OWNER, device: 'Chrome on Windows', created: t - 3600_000, lastSeen: t, expires: t + 8 * 3600_000, current: true },
    );
    this.log('login', 'Signed in with Discord (Safari on iPhone)', ME, t - 2 * DAY);
  }

  log(kind: string, text: string, userId: string | null, at = now()): void {
    this.events.unshift({ id: this.evId++, at, kind, text, userId });
  }
  user(uid: string) { return this.users.find((u) => u.id === uid); }
  me(): string | null { return this.persona === 'visitor' ? null : this.persona === 'owner' ? OWNER : ME; }
  isActive(l: Lic) { return l.status === 'active' && (l.end === 0 || l.end > now()); }
  active(uid: string) { return this.lics.some((l) => l.userId === uid && this.isActive(l)); }
  eff(l: Lic) { return l.status === 'active' && !this.isActive(l) ? 'expired' : l.status; }

  grant(uid: string, planId: string, source: string, at = now(), log = true, daysOverride?: number): Lic {
    const p = plan(planId)!;
    const days = daysOverride ?? p.days;
    const cur = this.lics.filter((l) => l.userId === uid && l.status === 'active').sort((a, b) => (a.end === 0 ? -1 : b.end === 0 ? 1 : b.end - a.end))[0];
    if (cur) {
      if (cur.end !== 0) { cur.end = days === 0 ? 0 : Math.max(cur.end, at) + days * DAY; cur.plan = planId; }
      if (log) this.log('renew', `Licence extended: ${p.label} from ${source === 'redeem' ? 'a redeem key' : source === 'panel' ? 'the owner' : 'a payment'}`, uid, at);
      return cur;
    }
    const l: Lic = { id: id(), userId: uid, plan: planId, status: 'active', start: at, end: days ? at + days * DAY : 0, machine: rnd() > 0.3, keySet: rnd() > 0.2 ? at : 0, moved: 0, lastSeen: rnd() > 0.3 ? at + DAY : null, source };
    if (uid === ME) { l.machine = false; l.keySet = 0; l.lastSeen = null; }
    this.lics.unshift(l);
    if (log) this.log('issue', `Licence activated: ${p.label} from ${source === 'redeem' ? 'a redeem key' : source === 'panel' ? 'the owner' : 'a payment'}`, uid, at);
    return l;
  }

  syncRole(uid: string): string {
    const u = this.user(uid);
    if (!u) return 'unchanged';
    const want = this.active(uid);
    if (want && !u.role) { if (u.inServer === false) return 'not_in_server'; u.role = true; this.log('role', 'Discord member role added', uid); return 'granted'; }
    if (!want && u.role) { u.role = false; this.log('role', 'Discord member role removed (no active licence)', uid); return 'removed'; }
    return 'unchanged';
  }

  /** price + n x 0.0001 USDT, unique among the demo orders (same rule as the server). */
  uniqueAmount(price: number): number {
    const base = Math.round(price * 1_000_000);
    const taken = new Set(this.orders.map((o) => o.expected));
    for (let k = 0; k < 400; k++) {
      const a = base + (1 + Math.floor(rnd() * 99)) * 100;
      if (!taken.has(a)) return a;
    }
    return base + 9900;
  }

  /** Preview: the buyer's payment arrives on the (pretend) blockchain. */
  pay(orderId: string): void {
    const o = this.orders.find((x) => x.id === orderId);
    if (!o || o.status !== 'pending') return;
    setTimeout(() => this.settle(o, hex(32), o.expected, 'blockchain', null), 2500);
  }

  settle(o: Ord, txid: string, value: number, by: string, note: string | null): void {
    if (o.status === 'paid') return;
    o.status = 'paid'; o.txid = txid; o.claimedTxid = null; o.received = value; o.payer = fakeWallet(); o.paidTx = now() - 20_000;
    o.paidAt = now(); o.decidedBy = by; o.note = note ?? o.note; o.updated = now();
    this.transfers.unshift({ txid, from: o.payer, value, at: o.paidTx, status: 'matched', orderId: o.id, note: null, seen: now(), decidedBy: null });
    this.grant(o.userId, o.plan, 'order');
    this.log('paid', `Payment confirmed for order ${o.id.slice(0, 8).toUpperCase()}: ${o.amount} USDT (${usdt(value)} USDT received)`, o.userId);
    this.syncRole(o.userId);
  }

  // ---- views
  licView(l: Lic) {
    const next = l.moved + 7 * DAY;
    return { id: l.id, plan: l.plan, planLabel: plan(l.plan)?.label ?? l.plan, status: this.eff(l), lifetime: l.end === 0, expiresAt: l.end, activated: l.machine, keySetAt: l.keySet, canMove: l.machine && now() >= next, nextMoveAt: now() >= next ? 0 : next };
  }
  ordView(o: Ord) {
    if (o.status === 'pending' && o.expires <= now()) o.status = 'expired';
    const payable = ['pending', 'confirming', 'expired'].includes(o.status);
    return {
      id: o.id, plan: o.plan, planLabel: plan(o.plan)?.label ?? o.plan, amount: o.amount, currency: 'USDT', status: o.status,
      createdAt: o.created, expiresAt: o.expires, paidAt: o.paidAt,
      pay: payable ? { address: DEMO_ADDRESS, amount: usdt(o.expected, 4)!, network: 'TRON (TRC20)', token: 'USDT', contract: USDT } : null,
      txid: o.txid ?? o.claimedTxid, received: usdt(o.received), canClaim: payable,
    };
  }
  adminOrder(o: Ord) {
    return {
      ...this.ordView(o), userId: o.userId, userName: this.user(o.userId)?.name ?? null, expected: usdt(o.expected, 4), received: usdt(o.received),
      txid: o.txid, claimedTxid: o.claimedTxid, payer: o.payer, paidTxAt: o.paidTx, expiresAt: o.expires, note: o.note, updatedAt: o.updated, decidedBy: o.decidedBy,
    };
  }
  trView(x: Tr) {
    return { txid: x.txid, from: x.from, amount: usdt(x.value)!, paidAt: x.at, status: x.status, orderId: x.orderId, note: x.note, seenAt: x.seen, decidedBy: x.decidedBy };
  }
  adminLic(l: Lic) {
    return { id: l.id, userId: l.userId, userName: this.user(l.userId)?.name ?? null, plan: l.plan, planLabel: plan(l.plan)?.label ?? l.plan, status: this.eff(l), lifetime: l.end === 0, startedAt: l.start, expiresAt: l.end, activated: l.machine, keySet: !!l.keySet, lastSeenAt: l.lastSeen, source: l.source, role: !!this.user(l.userId)?.role };
  }
  adminMember(u: User) {
    const paid = this.orders.filter((o) => o.userId === u.id && o.status === 'paid');
    const act = this.lics.filter((l) => l.userId === u.id && this.isActive(l));
    return {
      id: u.id, name: u.name, username: u.username, avatarUrl: null, banned: u.banned, owner: u.owner,
      spent: paid.reduce((s, o) => s + Number(o.amount), 0), orders: this.orders.filter((o) => o.userId === u.id).length,
      licences: this.lics.filter((l) => l.userId === u.id).length, activeUntil: act.length ? (act.some((l) => l.end === 0) ? 0 : Math.max(...act.map((l) => l.end))) : null,
      role: u.role, inServer: u.inServer, joinedAt: u.joined, lastLoginAt: u.lastLogin,
    };
  }
}

export const demoStore = new Store();

class ApiError { constructor(public status: number, public message = '') {} }
const fail = (status: number, message = ''): never => { throw new ApiError(status, message); };

function page<T>(rows: T[], q: URLSearchParams) {
  const size = Math.min(100, Math.max(5, Number(q.get('size')) || 25));
  const p = Math.max(1, Number(q.get('page')) || 1);
  return { items: rows.slice((p - 1) * size, p * size), total: rows.length, page: p, size };
}
const matches = (q: URLSearchParams, ...fields: (string | null | undefined)[]) => {
  const words = (q.get('q') ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const hay = fields.filter(Boolean).join(' ').toLowerCase();
  return words.every((w) => hay.includes(w));
};

function handle(method: string, path: string, q: URLSearchParams, body: Record<string, unknown>): unknown {
  const s = demoStore;
  const uid = s.me();
  const seg = path.split('/');
  const t = now();

  if (path === 'health') return { ok: true };
  if (path === 'site') {
    return { name: 'FXR OrderFlow', company: 'FXR Fluxora', discord: 'https://discord.com', support: 'support@example.com', paymentsOpen: true,
      plans: PLANS.map((p) => ({ ...p, lifetime: p.days === 0, perMonth: p.days >= 60 ? Math.round((p.price / Math.round(p.days / 30)) * 100) / 100 : null })) };
  }
  if (path === 'auth/me') {
    if (!uid) return { authenticated: false };
    const u = s.user(uid)!;
    return { authenticated: true, user: { id: u.id, name: u.name, username: u.username, avatarUrl: null }, admin: s.persona === 'owner', adminMfaRequired: false };
  }
  if (path === 'auth/logout') { s.persona = 'visitor'; return { ok: true }; }

  // ---------- owner panel
  if (seg[0] === s.panelPath) {
    if (s.persona !== 'owner') fail(404);
    const p = seg.slice(1).join('/');
    const ids = (body['ids'] as string[] | undefined) ?? [];
    switch (`${method} ${seg[1]}${seg[2] ? '/' + seg[2] : ''}`) {
      case 'GET overview': {
        const tz = Number(q.get('tz') ?? 0) * 60_000;
        const dayStart = Math.floor((t - tz) / DAY) * DAY + tz;
        const paid = s.orders.filter((o) => o.status === 'paid');
        const sum = (from: number) => paid.filter((o) => o.paidAt! >= from).reduce((a, o) => a + Number(o.amount), 0);
        const first = Math.floor((dayStart - tz) / DAY) - 29;
        const days = Array.from({ length: 30 }, (_, i) => {
          const d0 = (first + i) * DAY + tz;
          const rows = paid.filter((o) => o.paidAt! >= d0 && o.paidAt! < d0 + DAY);
          return { day: (first + i) * DAY, amount: rows.reduce((a, o) => a + Number(o.amount), 0), orders: rows.length };
        });
        const act = s.lics.filter((l) => s.isActive(l));
        const mix = new Map<string, number>();
        act.forEach((l) => mix.set(plan(l.plan)!.label, (mix.get(plan(l.plan)!.label) ?? 0) + 1));
        return {
          revenue: { today: sum(dayStart), last30: sum(dayStart - 29 * DAY), total: sum(0), orders30: paid.filter((o) => o.paidAt! >= dayStart - 29 * DAY).length },
          days,
          stats: {
            activeLicences: act.length, lifetime: act.filter((l) => l.end === 0).length, expiring7: act.filter((l) => l.end && l.end - t < 7 * DAY).length,
            members: s.users.length, newMembers7: s.users.filter((u) => u.joined > t - 7 * DAY).length,
            attention: s.orders.filter((o) => ['review', 'partially_paid', 'refunded'].includes(o.status)).length + s.transfers.filter((x) => x.status === 'unmatched').length,
            unmatched: s.transfers.filter((x) => x.status === 'unmatched').length,
            inProgress: s.orders.filter((o) => ['pending', 'confirming'].includes(o.status)).length,
            unusedCodes: s.codes.filter((c) => c.status === 'unused').length,
          },
          planMix: [...mix.entries()].sort((a, b) => b[1] - a[1]).map(([plan, count]) => ({ plan, count })),
          checkout: {
            provider: 'Direct to your wallet (TRON)', configured: true, payCurrency: 'USDT (TRC20)', address: DEMO_ADDRESS, sources: ['api.trongrid.io'],
            windowMinutes: 30, lastOkAt: t - 12_000, lastError: null, lastErrorAt: null, addressChangedAt: null,
          },
          roleSync: true,
        };
      }
      case 'GET orders': {
        const st = q.get('status') ?? '';
        const rows = s.orders.filter((o) =>
          (!st || (st === 'attention' ? ['review', 'partially_paid', 'refunded'].includes(o.status) : st === 'open' ? ['pending', 'confirming'].includes(o.status) : o.status === st)) &&
          (!q.get('plan') || o.plan === q.get('plan')) && matches(q, o.id, o.userId, s.user(o.userId)?.name, s.user(o.userId)?.username, o.txid, o.payer, usdt(o.expected, 4)));
        return page(rows.map((o) => s.adminOrder(o)), q);
      }
      case 'POST orders/recheck': { const o = s.orders.find((x) => x.id === body['id']) ?? fail(404); return { status: (o as Ord).status }; }
      case 'GET transfers': {
        const st = q.get('status') ?? '';
        const rows = s.transfers.filter((x) => (st === 'all' ? true : st ? x.status === st : x.status === 'unmatched') && matches(q, x.txid, x.from, x.orderId, usdt(x.value)));
        return page(rows.map((x) => ({ ...s.trView(x), id: x.txid })), q);
      }
      case 'POST transfers/assign': {
        const x = (s.transfers.find((y) => y.txid === body['txid']) ?? fail(404, 'Unknown transaction.')) as Tr;
        if (x.status !== 'unmatched') fail(409, 'This payment is already matched or ignored.');
        const ref = String(body['orderId'] ?? '').toLowerCase();
        const o = (s.orders.find((y) => y.id.startsWith(ref) && ref.length >= 8) ?? fail(404, 'Unknown order.')) as Ord;
        if (o.status === 'paid') fail(409, 'This order is already paid.');
        s.transfers = s.transfers.filter((y) => y !== x);
        s.settle(o, x.txid, x.value, OWNER, `payment of ${usdt(x.value)} USDT assigned by the owner`);
        return { status: 'paid' };
      }
      case 'POST transfers/ignore': {
        const x = (s.transfers.find((y) => y.txid === body['txid'] && y.status === 'unmatched') ?? fail(404, 'This payment is not waiting for a decision.')) as Tr;
        x.status = 'ignored'; x.note = String(body['note'] ?? '') || 'set aside by the owner'; x.decidedBy = OWNER;
        return { ok: true };
      }
      case 'POST orders/mark-paid': {
        const o = (s.orders.find((x) => x.id === body['id']) ?? fail(404)) as Ord;
        if (o.status === 'paid') fail(409, 'This order is already paid.');
        o.status = 'paid'; o.paidAt = t; o.decidedBy = OWNER; o.note = String(body['note'] ?? '') || 'confirmed manually by the owner';
        s.grant(o.userId, o.plan, 'order'); s.syncRole(o.userId);
        s.log('paid', `Payment confirmed for order ${o.id.slice(0, 8).toUpperCase()}: ${o.amount} USDT`, o.userId);
        return { status: 'paid' };
      }
      case 'POST orders/cancel': {
        let done = 0;
        for (const o of s.orders) if (ids.includes(o.id) && o.status !== 'paid' && o.status !== 'cancelled') { o.status = 'cancelled'; done++; s.log('cancel', `Order ${o.id.slice(0, 8).toUpperCase()} cancelled by the owner`, o.userId); }
        return { done };
      }
      case 'GET licences': {
        const st = q.get('status') ?? '';
        const rows = s.lics.filter((l) => {
          const a = s.isActive(l);
          const ok = !st || (st === 'active' && a) || (st === 'expiring' && a && l.end && l.end - t < 7 * DAY) || (st === 'expired' && l.status === 'active' && !a) || (st === 'lifetime' && a && l.end === 0) || (st === 'revoked' && l.status === 'revoked');
          return ok && (!q.get('plan') || l.plan === q.get('plan')) && matches(q, l.userId, s.user(l.userId)?.name, s.user(l.userId)?.username);
        });
        return page(rows.map((l) => s.adminLic(l)), q);
      }
      case 'POST licences/grant': {
        const u = String(body['userId'] ?? '');
        if (!/^\d{17,20}$/.test(u)) fail(400, 'Enter a Discord user id (17-20 digits).');
        if (!s.user(u)) s.users.push({ id: u, name: 'Member ' + u.slice(-4), username: 'member' + u.slice(-4), banned: false, owner: false, joined: t, lastLogin: 0, role: false, inServer: null });
        const l = s.grant(u, String(body['plan']), 'panel', t, true, body['days'] ? Number(body['days']) : undefined);
        s.syncRole(u);
        return { id: l.id };
      }
      case 'POST licences/extend': {
        let done = 0;
        for (const l of s.lics) if (ids.includes(l.id) && l.status === 'active' && l.end !== 0) { l.end = Math.max(l.end, t) + Number(body['days']) * DAY; done++; s.log('extend', `Licence extended by ${body['days']} days by the owner`, l.userId); s.syncRole(l.userId); }
        return { done };
      }
      case 'POST licences/revoke': {
        let done = 0;
        for (const l of s.lics) if (ids.includes(l.id) && l.status !== 'revoked') { l.status = 'revoked'; done++; s.log('revoke', 'Licence revoked by the owner', l.userId); s.syncRole(l.userId); }
        return { done };
      }
      case 'POST licences/reset-machine': { const l = (s.lics.find((x) => x.id === body['id']) ?? fail(404)) as Lic; l.machine = false; s.log('reset', 'Computer reset by the owner', l.userId); return { ok: true }; }
      case 'GET members': {
        const f = q.get('filter') ?? '';
        const rows = s.users.filter((u) => {
          const any = s.lics.some((l) => l.userId === u.id);
          const a = s.active(u.id);
          const ok = !f || (f === 'active' && a) || (f === 'expired' && any && !a) || (f === 'none' && !any) || (f === 'banned' && u.banned);
          return ok && matches(q, u.id, u.name, u.username);
        }).sort((a, b) => b.lastLogin - a.lastLogin);
        return page(rows.map((u) => s.adminMember(u)), q);
      }
      case 'POST members/ban': case 'POST members/unban': {
        const ban = seg[2] === 'ban';
        let done = 0;
        for (const u of s.users) if (ids.includes(u.id) && !u.owner) { u.banned = ban; done++; s.log('ban', `Member ${ban ? 'banned' : 'unbanned'} by the owner`, u.id); }
        return { done };
      }
      case 'POST members/logout': { const n = s.sessions.filter((x) => x.userId === body['id'] && !x.current).length; s.sessions = s.sessions.filter((x) => x.userId !== body['id'] || x.current); return { ended: n }; }
      case 'POST members/sync-role': return { result: s.syncRole(String(body['id'])) };
      case 'GET codes': {
        const st = q.get('status') ?? '';
        const rows = s.codes.filter((c) => (!st || c.status === st) && (!q.get('batch') || c.batch === q.get('batch')) && matches(q, c.hint, c.batch, c.usedBy, s.user(c.usedBy ?? '')?.name));
        const batches = [...new Set(s.codes.map((c) => c.batch).filter(Boolean))].map((b) => ({ batch: b!, n: s.codes.filter((c) => c.batch === b).length, used: s.codes.filter((c) => c.batch === b && c.status === 'used').length }));
        return { ...page(rows.map((c) => ({ id: c.id, hint: c.hint, plan: c.plan, days: c.days, status: c.status, batch: c.batch, createdAt: c.created, usedBy: c.usedBy, usedByName: s.user(c.usedBy ?? '')?.name ?? null, usedAt: c.usedAt })), q), batches };
      }
      case 'POST codes/generate': {
        const pl = plan(String(body['plan'])) ?? fail(404, 'Unknown plan');
        const out: string[] = [];
        for (let i = 0; i < Number(body['count']); i++) {
          const g = [group(), group(), group(), group()];
          const raw = 'RDM-' + g.join('-');
          out.push(raw);
          s.codes.unshift({ id: id(), hint: g[3], raw, plan: (pl as typeof PLANS[0]).id, days: (pl as typeof PLANS[0]).days, status: 'unused', batch: String(body['batch'] || '') || null, created: t, usedBy: null, usedAt: null });
        }
        s.log('codes', `${out.length} redeem key(s) generated (${(pl as typeof PLANS[0]).label})`, null);
        return { codes: out };
      }
      case 'POST codes/disable': {
        let done = 0;
        for (const c of s.codes) if (ids.includes(c.id) && c.status === 'unused') { c.status = 'disabled'; done++; }
        return { done };
      }
      case 'GET events': {
        const k = q.get('kind') ?? '';
        const rows = s.events.filter((e) => (!k || e.kind === k) && matches(q, e.text, e.userId, s.user(e.userId ?? '')?.name));
        return page(rows.map((e) => ({ id: e.id, at: e.at, kind: e.kind, text: e.text, userId: e.userId, userName: s.user(e.userId ?? '')?.name ?? null })), q);
      }
    }
    if (method === 'GET' && seg[1] === 'members' && seg[2]) {
      const u = s.user(seg[2]) ?? fail(404);
      const m = u as User;
      return {
        user: { id: m.id, name: m.name, username: m.username, avatarUrl: null, banned: m.banned, owner: m.owner, joinedAt: m.joined, lastLoginAt: m.lastLogin, role: m.role, inServer: m.inServer },
        spent: s.adminMember(m).spent,
        licences: s.lics.filter((l) => l.userId === m.id).map((l) => s.adminLic(l)),
        orders: s.orders.filter((o) => o.userId === m.id).map((o) => s.adminOrder(o)),
        sessions: s.sessions.filter((x) => x.userId === m.id).map((x) => ({ device: x.device, lastSeenAt: x.lastSeen, createdAt: x.created, owner: m.owner })),
        codes: s.codes.filter((c) => c.usedBy === m.id).map((c) => ({ hint: c.hint, plan: c.plan, days: c.days, usedAt: c.usedAt })),
        events: s.events.filter((e) => e.userId === m.id).slice(0, 40).map((e) => ({ at: e.at, kind: e.kind, text: e.text })),
      };
    }
    void p;
    return fail(404);
  }

  // ---------- signed-in member
  if (seg[0] === 'account' || seg[0] === 'orders') {
    if (!uid) fail(401);
    const u = s.user(uid!)!;
    if (method === 'GET' && path === 'account') {
      return {
        licences: s.lics.filter((l) => l.userId === uid).map((l) => s.licView(l)),
        orders: s.orders.filter((o) => o.userId === uid).map((o) => s.ordView(o)),
        discord: { invite: 'https://discord.com', roleSync: true, roleGranted: u.role, inServer: u.inServer },
        activity: s.events.filter((e) => e.userId === uid).slice(0, 30).map((e) => ({ at: e.at, kind: e.kind, text: e.text })),
      };
    }
    if (seg[0] === 'account' && seg[1] === 'licences') {
      const l = (s.lics.find((x) => x.id === seg[2] && x.userId === uid) ?? fail(404)) as Lic;
      if (seg[3] === 'key') { l.keySet = t; s.log('key', 'New licence key generated (the previous one stopped working)', uid); return { key: 'FXR-' + [group(), group(), group(), group()].join('-') }; }
      if (seg[3] === 'move') { l.machine = false; l.moved = t; s.log('move', 'Computer released to move the licence', uid); return { ok: true, nextMoveAt: t + 7 * DAY }; }
    }
    if (path === 'account/redeem') {
      const code = String(body['code'] ?? '').toUpperCase();
      const c = s.codes.find((x) => x.status === 'unused' && (x.raw === code || (!x.raw && code.endsWith(x.hint))));
      if (!c) fail(404, 'This key is not valid or has already been used.');
      c!.status = 'used'; c!.usedBy = uid; c!.usedAt = t;
      const l = s.grant(uid!, c!.plan, 'redeem', t, true, c!.days);
      s.log('redeem', `Redeem key …${c!.hint} activated (${c!.days ? '+' + c!.days + ' days' : 'lifetime'})`, uid);
      s.syncRole(uid!);
      return { plan: c!.plan, days: c!.days, expiresAt: l.end };
    }
    if (path === 'account/discord/sync') return { result: s.syncRole(uid!) };
    if (path === 'account/sessions') return s.sessions.filter((x) => x.userId === uid).map((x) => ({ id: x.id, current: x.current, device: x.device, createdAt: x.created, lastSeenAt: x.lastSeen, expiresAt: x.expires }));
    if (path === 'account/sessions/revoke') { s.sessions = s.sessions.filter((x) => !(x.userId === uid && x.id === body['id'] && !x.current)); s.log('security', 'A session was signed out', uid); return { ok: true }; }
    if (path === 'account/sessions/revoke-others') {
      const n = s.sessions.filter((x) => x.userId === uid && !x.current).length;
      s.sessions = s.sessions.filter((x) => x.userId !== uid || x.current);
      s.log('security', `Signed out of ${n} other session(s)`, uid);
      return { ok: true, ended: n };
    }
    if (method === 'POST' && path === 'orders') {
      if (body['acceptTerms'] !== true) fail(400, 'Please accept the Terms and the Risk disclosure to continue.');
      const p = (plan(String(body['plan'])) ?? fail(404, 'Unknown plan')) as typeof PLANS[0];
      const same = s.orders.find((x) => x.userId === uid && x.plan === p.id && x.status === 'pending' && x.expires > t + 10 * 60_000);
      if (same) return s.ordView(same);
      const o: Ord = {
        id: hex(12), userId: uid!, plan: p.id, amount: p.price.toFixed(2), status: 'pending', expected: s.uniqueAmount(p.price), received: null, txid: null,
        claimedTxid: null, payer: null, paidTx: null, expires: t + 30 * 60_000, note: null, created: t, updated: t, paidAt: null, decidedBy: null,
      };
      s.orders.unshift(o);
      s.log('order', `Order ${o.id.slice(0, 8).toUpperCase()} opened: ${p.label}, ${usdt(o.expected, 4)} USDT`, uid);
      return s.ordView(o);
    }
    if (seg[0] === 'orders' && seg[1]) {
      const o = (s.orders.find((x) => x.id === seg[1] && x.userId === uid) ?? fail(404)) as Ord;
      if (method === 'GET') return s.ordView(o);
      if (seg[2] === 'cancel') { if (o.status !== 'pending') fail(409, 'Only an order waiting for its payment can be cancelled.'); o.status = 'cancelled'; return s.ordView(o); }
      if (seg[2] === 'txid') {
        const tx = String(body['txid'] ?? '').trim().toLowerCase().replace(/^0x/, '');
        if (!/^[0-9a-f]{64}$/.test(tx)) fail(400, 'A transaction id (hash) is 64 characters: 0-9 and a-f.');
        if (!['pending', 'expired', 'confirming'].includes(o.status)) fail(409, 'This order cannot take a payment anymore. Contact support on Discord.');
        if (s.orders.some((x) => x.id !== o.id && (x.txid === tx || x.claimedTxid === tx))) fail(409, 'This transaction is already attached to another order.');
        o.claimedTxid = tx; o.status = 'confirming'; o.updated = t;
        s.log('order', `Transaction ${tx.slice(0, 10)}… given for order ${o.id.slice(0, 8).toUpperCase()}`, uid);
        setTimeout(() => s.settle(o, tx, Math.round(Number(o.amount) * 1_000_000), 'blockchain', 'matched by transaction id'), 3000);
        return s.ordView(o);
      }
    }
  }
  return fail(404);
}

export const demoInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith('/api/')) return next(req);
  const [path, qs] = req.url.slice(5).split('?');
  const q = new URLSearchParams(qs ?? '');
  req.params.keys().forEach((k) => q.set(k, req.params.get(k) ?? ''));
  return timer(140).pipe(
    mergeMap((): Observable<HttpResponse<unknown>> => {
      try {
        const body = handle(req.method, path, q, (req.body as Record<string, unknown> | null) ?? {});
        return of(new HttpResponse({ status: req.method === 'POST' ? 201 : 200, body, url: req.url }));
      } catch (e) {
        const err = e instanceof ApiError ? e : new ApiError(500);
        if (!(e instanceof ApiError)) console.warn('[demo api]', e);
        return throwError(() => new HttpErrorResponse({ status: err.status, error: { statusCode: err.status, message: err.message }, url: req.url }));
      }
    }),
  );
};
