// In-browser stand-in for the NestJS API, used only by the preview build. Mirrors the real endpoints' shapes.
import { HttpErrorResponse, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { Observable, of, throwError, timer } from 'rxjs';
import { map, mergeMap } from 'rxjs/operators';

type Persona = 'visitor' | 'member' | 'owner';
interface User { id: string; name: string; username: string; banned: boolean; lastLoginAt: number; owner: boolean }
interface Lic {
  id: string; userRef: string; plan: string; status: string; startMs: number; endMs: number;
  machine: boolean; keySetAt: number; movedAt: number; lastSeenAt: number | null; source: string; createdAt: number;
}
interface Ord {
  id: string; userId: string; plan: string; amount: string; status: string; txid: string | null;
  note: string | null; createdAt: number; expiresAt: number; submittedAt: number | null; decidedAt: number | null;
}

const DAY = 86400_000;
const now = () => Date.now();
const PAY_TO = 'DEMO-ADDRESS-DO-NOT-PAY';
const USDT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const PLANS = [
  { id: 'month1', label: '1 month', price: 8, days: 30 },
  { id: 'month3', label: '3 months', price: 24, days: 90 },
  { id: 'month6', label: '6 months', price: 48, days: 180 },
  { id: 'year1', label: '1 year', price: 96, days: 365 },
  { id: 'lifetime', label: 'Lifetime', price: 67, days: 0 },
];
const OWNER = '111111111111111111';
const ME = '333333333333333333';

const hex = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, '0')).join('');
const id = () => hex(12);
const KEY_ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newKey = () => 'FXR-' + [0, 1, 2, 3].map(() => Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => KEY_ALPHA[b % 32]).join('')).join('-');
const plan = (p: string) => PLANS.find((x) => x.id === p);

class Store {
  persona: Persona = 'visitor';
  panelPath = 'owner-panel';
  users: User[] = [
    { id: OWNER, name: 'You (owner)', username: 'owner', banned: false, lastLoginAt: now() - 3600_000, owner: true },
    { id: ME, name: 'Demo member', username: 'demo_member', banned: false, lastLoginAt: now() - 600_000, owner: false },
    { id: '555555555555555555', name: 'Alex', username: 'alex_trades', banned: false, lastLoginAt: now() - 2 * 3600_000, owner: false },
    { id: '666666666666666666', name: 'Sam', username: 'sam.nq', banned: false, lastLoginAt: now() - 3 * DAY, owner: false },
    { id: '777777777777777777', name: 'Chris', username: 'chris_es', banned: false, lastLoginAt: now() - 40 * DAY, owner: false },
  ];
  lics: Lic[] = [
    { id: id(), userRef: '555555555555555555', plan: 'month1', status: 'active', startMs: now() - 26 * DAY, endMs: now() + 4 * DAY, machine: true, keySetAt: now() - 26 * DAY, movedAt: 0, lastSeenAt: now() - 7200_000, source: 'order', createdAt: now() - 26 * DAY },
    { id: id(), userRef: '666666666666666666', plan: 'lifetime', status: 'active', startMs: now() - 60 * DAY, endMs: 0, machine: true, keySetAt: now() - 60 * DAY, movedAt: 0, lastSeenAt: now() - DAY, source: 'order', createdAt: now() - 60 * DAY },
    { id: id(), userRef: '777777777777777777', plan: 'month1', status: 'active', startMs: now() - 70 * DAY, endMs: now() - 40 * DAY, machine: true, keySetAt: now() - 70 * DAY, movedAt: 0, lastSeenAt: now() - 41 * DAY, source: 'order', createdAt: now() - 70 * DAY },
  ];
  orders: Ord[] = [
    { id: id(), userId: '555555555555555555', plan: 'month1', amount: '8.52', status: 'submitted', txid: hex(32), note: null, createdAt: now() - 3 * 3600_000, expiresAt: now() + 21 * 3600_000, submittedAt: now() - 2.5 * 3600_000, decidedAt: null },
    { id: id(), userId: '666666666666666666', plan: 'lifetime', amount: '67.14', status: 'paid', txid: hex(32), note: null, createdAt: now() - 60 * DAY, expiresAt: now() - 59 * DAY, submittedAt: now() - 60 * DAY, decidedAt: now() - 60 * DAY },
  ];
  events = [
    { ts_ms: now() - 2.5 * 3600_000, kind: 'payment', text: 'order …: transaction id submitted by 555555555555555555' },
    { ts_ms: now() - 3 * 3600_000, kind: 'order', text: 'order …: opened by 555555555555555555: month1 for 8.52 USDT' },
  ];

  log(kind: string, text: string) { this.events.unshift({ ts_ms: now(), kind, text }); }
  userId(): string | null { return this.persona === 'visitor' ? null : this.persona === 'owner' ? OWNER : ME; }
  name(uid: string) { return this.users.find((u) => u.id === uid)?.name ?? null; }
  isActive(l: Lic) { return l.status === 'active' && (l.endMs === 0 || l.endMs > now()); }
  effStatus(l: Lic) { return l.status === 'active' && !this.isActive(l) ? 'expired' : l.status; }

  grant(uid: string, planId: string, source: string): Lic {
    const p = plan(planId)!;
    const cur = this.lics.filter((l) => l.userRef === uid && l.status === 'active').sort((a, b) => (a.endMs === 0 ? -1 : b.endMs === 0 ? 1 : b.endMs - a.endMs))[0];
    if (cur) {
      if (cur.endMs !== 0) { cur.endMs = p.days === 0 ? 0 : Math.max(cur.endMs, now()) + p.days * DAY; cur.plan = planId; }
      this.log('renew', `licence of ${uid} extended with ${planId} via ${source}`);
      return cur;
    }
    const l: Lic = { id: id(), userRef: uid, plan: planId, status: 'active', startMs: now(), endMs: p.days ? now() + p.days * DAY : 0, machine: false, keySetAt: 0, movedAt: 0, lastSeenAt: null, source, createdAt: now() };
    this.lics.unshift(l);
    this.log('issue', `licence created for ${uid} (${planId}) via ${source}`);
    return l;
  }

  licView(l: Lic) {
    const next = l.movedAt + 7 * DAY;
    return { id: l.id, plan: l.plan, planLabel: plan(l.plan)?.label ?? l.plan, status: this.effStatus(l), lifetime: l.endMs === 0, expiresAt: l.endMs, activated: l.machine, keySetAt: l.keySetAt, canMove: l.machine && now() >= next, nextMoveAt: now() >= next ? 0 : next };
  }
  ordView(o: Ord) {
    return { id: o.id, plan: o.plan, planLabel: plan(o.plan)?.label ?? o.plan, amount: o.amount, token: 'USDT', network: 'TRON (TRC20)', payTo: PAY_TO, status: o.status, txid: o.txid, note: o.note, createdAt: o.createdAt, expiresAt: o.expiresAt, submittedAt: o.submittedAt, decidedAt: o.decidedAt };
  }
}

export const demoStore = new Store();

class ApiError { constructor(public status: number, public message = '') {} }
const fail = (status: number, message = ''): never => { throw new ApiError(status, message); };

function handle(method: string, path: string, body: Record<string, unknown> | null): unknown {
  const s = demoStore;
  const uid = s.userId();
  const seg = path.split('/');

  if (method === 'GET' && path === 'site') {
    return { name: 'FXR OrderFlow', company: 'FXR Fluxora', discord: '', support: '', paymentsOpen: true,
      plans: PLANS.map((p) => ({ ...p, lifetime: p.days === 0, perMonth: p.days >= 60 ? Math.round(p.price / Math.round(p.days / 30)) : null })) };
  }
  if (method === 'GET' && path === 'auth/me') {
    if (!uid) return { authenticated: false };
    const u = s.users.find((x) => x.id === uid)!;
    return { authenticated: true, user: { id: u.id, name: u.name, username: u.username, avatarUrl: null }, admin: s.persona === 'owner', adminMfaRequired: false };
  }
  if (method === 'POST' && path === 'auth/logout') { s.persona = 'visitor'; return { ok: true }; }

  // ---- owner panel
  if (seg[0] === s.panelPath) {
    if (s.persona !== 'owner') fail(404);
    const p = seg.slice(1).join('/');
    const b = body ?? {};
    if (method === 'GET' && p === 'state') {
      const toCheck = s.orders.filter((o) => o.status === 'submitted').length;
      return {
        payAddress: PAY_TO, usdtContract: USDT,
        stats: { total: s.lics.length, active: s.lics.filter((l) => s.isActive(l)).length, expiringSoon: s.lics.filter((l) => s.isActive(l) && l.endMs && l.endMs - now() < 7 * DAY).length, toCheck, members: s.users.length },
        plans: PLANS,
        orders: [...s.orders].sort((a, b2) => Number(b2.status === 'submitted') - Number(a.status === 'submitted') || b2.createdAt - a.createdAt).map((o) => ({ ...s.ordView(o), userId: o.userId, userName: s.name(o.userId) })),
        licences: s.lics.map((l) => ({ id: l.id, userRef: l.userRef, userName: s.name(l.userRef), plan: l.plan, status: s.effStatus(l), lifetime: l.endMs === 0, expiresAt: l.endMs, activated: l.machine, keySet: !!l.keySetAt, lastSeenAt: l.lastSeenAt, source: l.source, createdAt: l.createdAt })),
        members: s.users.map((u) => ({ ...u, licences: s.lics.filter((l) => l.userRef === u.id).length })),
        events: s.events.slice(0, 60),
      };
    }
    const o = s.orders.find((x) => x.id === b['id']);
    const l = s.lics.find((x) => x.id === b['id']);
    const u = s.users.find((x) => x.id === b['id']);
    switch (p) {
      case 'orders/confirm':
        if (!o) fail(404);
        if (o!.status !== 'submitted') fail(409, 'Only a submitted payment can be confirmed.');
        s.grant(o!.userId, o!.plan, 'order');
        o!.status = 'paid'; o!.decidedAt = now();
        s.log('confirm', `order (${o!.amount} USDT) confirmed by owner`);
        return s.ordView(o!);
      case 'orders/reject':
        if (!o) fail(404);
        o!.status = 'rejected'; o!.note = String(b['note'] ?? '') || null; o!.decidedAt = now();
        s.log('reject', 'order rejected by owner');
        return s.ordView(o!);
      case 'licences/create': {
        if (!/^\d{17,20}$/.test(String(b['userRef']))) fail(400, 'userRef must be a Discord user id');
        if (!s.users.some((x) => x.id === b['userRef'])) s.users.push({ id: String(b['userRef']), name: 'Member ' + String(b['userRef']).slice(-4), username: 'member', banned: false, lastLoginAt: 0, owner: false });
        return { id: s.grant(String(b['userRef']), String(b['plan']), 'panel').id };
      }
      case 'licences/revoke': if (!l) fail(404); l!.status = 'revoked'; s.log('revoke', 'licence revoked by owner'); return { ok: true };
      case 'licences/reset-machine': if (!l) fail(404); l!.machine = false; s.log('reset', 'computer reset by owner'); return { ok: true };
      case 'members/ban': if (!u || u.owner) fail(404); u!.banned = true; s.log('ban', `member ${u!.id} banned`); return { ok: true };
      case 'members/unban': if (!u) fail(404); u!.banned = false; s.log('ban', `member ${u!.id} unbanned`); return { ok: true };
      case 'members/logout': s.log('sessions', `sessions of ${String(b['id'])} ended`); return { ok: true, ended: 1 };
    }
    fail(404);
  }

  // ---- signed-in member
  if (path.startsWith('account') || path.startsWith('orders')) {
    if (!uid) fail(401);
    if (method === 'GET' && path === 'account') {
      return { licences: s.lics.filter((l) => l.userRef === uid).map((l) => s.licView(l)), orders: s.orders.filter((o) => o.userId === uid).map((o) => s.ordView(o)) };
    }
    if (seg[0] === 'account' && seg[1] === 'licences') {
      const l = s.lics.find((x) => x.id === seg[2] && x.userRef === uid);
      if (!l || l.status === 'revoked') fail(404);
      if (seg[3] === 'key') { l!.keySetAt = now(); s.log('key', 'owner of a licence generated a new key'); return { key: newKey() }; }
      if (seg[3] === 'move') { if (!l!.machine) return { ok: true, nextMoveAt: 0 }; l!.machine = false; l!.movedAt = now(); return { ok: true, nextMoveAt: now() + 7 * DAY }; }
    }
    if (method === 'POST' && path === 'orders') {
      const p = plan(String(body?.['plan']));
      if (!p) fail(404, 'Unknown plan');
      const same = s.orders.find((o) => o.userId === uid && o.plan === p!.id && o.status === 'pending');
      if (same) return s.ordView(same);
      const used = new Set(s.orders.filter((o) => o.status === 'pending' || o.status === 'submitted').map((o) => o.amount));
      let amount = '';
      do { amount = `${p!.price}.${String(1 + Math.floor(Math.random() * 99)).padStart(2, '0')}`; } while (used.has(amount));
      const o: Ord = { id: id(), userId: uid!, plan: p!.id, amount, status: 'pending', txid: null, note: null, createdAt: now(), expiresAt: now() + DAY, submittedAt: null, decidedAt: null };
      s.orders.unshift(o);
      s.log('order', `order opened by ${uid}: ${p!.id} for ${amount} USDT`);
      return s.ordView(o);
    }
    if (seg[0] === 'orders' && seg[1]) {
      const o = s.orders.find((x) => x.id === seg[1] && x.userId === uid);
      if (!o) fail(404);
      if (method === 'GET' && seg.length === 2) return s.ordView(o!);
      if (seg[2] === 'txid') {
        if (o!.status !== 'pending') fail(409, 'This order is not waiting for a payment.');
        const t = String(body?.['txid'] ?? '').trim().toLowerCase();
        if (!/^[0-9a-f]{64}$/.test(t)) fail(409, 'A TRON transaction ID is 64 characters (0-9, a-f).');
        if (s.orders.some((x) => x.txid === t)) fail(409, 'This transaction ID was already submitted.');
        o!.txid = t; o!.status = 'submitted'; o!.submittedAt = now();
        s.log('payment', `order: transaction id submitted by ${uid}`);
        return s.ordView(o!);
      }
      if (seg[2] === 'cancel') {
        if (o!.status !== 'pending') fail(409, 'Only an unpaid order can be cancelled.');
        o!.status = 'cancelled';
        return s.ordView(o!);
      }
    }
  }
  return fail(404);
}

export const demoInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith('/api/')) return next(req);
  const path = req.url.slice(5).split('?')[0];
  return timer(120).pipe(
    mergeMap((): Observable<HttpResponse<unknown>> => {
      try {
        const body = handle(req.method, path, (req.body as Record<string, unknown> | null) ?? null);
        return of(new HttpResponse({ status: req.method === 'POST' ? 201 : 200, body, url: req.url }));
      } catch (e) {
        const err = e instanceof ApiError ? e : new ApiError(500);
        return throwError(() => new HttpErrorResponse({ status: err.status, error: { statusCode: err.status, message: err.message }, url: req.url }));
      }
    }),
    map((r) => r),
  );
};
