import { Inject, Injectable } from '@nestjs/common';
import { DbService, type EventRow } from '../db/db.service';
import { LicencesService, type LicenceRow } from '../licences/licences.service';
import { OrdersService, type OrderRow, type TransferRow } from '../orders/orders.service';
import { fromMicro, toMicro } from '../payments/tron';
import { AuthService, type UserRow } from '../auth/auth.service';
import { CONFIG, type AppConfig } from '../config';
import type { CodeRow } from '../codes/codes.service';

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}

export interface ListQuery {
  q?: string;
  status?: string;
  plan?: string;
  filter?: string;
  kind?: string;
  batch?: string;
  sort?: string;
  page?: number;
  size?: number;
}

const DAY = 86400_000;

/** LIKE pattern with the user's text escaped (no wildcard injection). */
function like(q: string): string {
  return '%' + q.replace(/[\\%_]/g, (c) => '\\' + c) + '%';
}

class Where {
  parts: string[] = [];
  params: unknown[] = [];
  add(sql: string, ...p: unknown[]): this {
    this.parts.push(sql);
    this.params.push(...p);
    return this;
  }
  get sql(): string {
    return this.parts.length ? 'WHERE ' + this.parts.join(' AND ') : '';
  }
}

/**
 * Read models for the owner's panel. Everything is paginated, filtered and searched in SQL so the panel stays
 * fast with thousands of orders. Sort keys come from fixed lists; user text only ever goes in as a parameter.
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly db: DbService,
    private readonly licences: LicencesService,
    private readonly orders: OrdersService,
    private readonly auth: AuthService,
    @Inject(CONFIG) private readonly cfg: AppConfig,
  ) {}

  private paging(q: ListQuery): { page: number; size: number; offset: number } {
    const size = Math.min(Math.max(q.size ?? 25, 5), 100);
    const page = Math.max(q.page ?? 1, 1);
    return { page, size, offset: (page - 1) * size };
  }

  private planLabel(id: string): string {
    return this.licences.plan(id)?.label ?? id;
  }

  // ---------- overview

  overview(tzMinutes = 0) {
    const now = Date.now();
    const tz = tzMinutes * 60_000;
    const dayStart = Math.floor((now - tz) / DAY) * DAY + tz;
    const paid = (from: number) =>
      this.db.get<{ s: number | null; n: number }>(
        `SELECT SUM(CAST(amount AS REAL)) AS s, COUNT(*) AS n FROM orders WHERE status = 'paid' AND decided_ms >= ?`, from,
      )!;
    const series = this.db.all<{ d: number; s: number; n: number }>(
      `SELECT CAST((decided_ms - ?) / ${DAY} AS INTEGER) AS d, SUM(CAST(amount AS REAL)) AS s, COUNT(*) AS n
         FROM orders WHERE status = 'paid' AND decided_ms >= ? GROUP BY d`,
      tz, dayStart - 29 * DAY,
    );
    const byDay = new Map(series.map((r) => [r.d, r]));
    const firstDay = Math.floor((dayStart - tz) / DAY) - 29;
    const days = Array.from({ length: 30 }, (_, i) => {
      const r = byDay.get(firstDay + i);
      return { day: (firstDay + i) * DAY, amount: Math.round((r?.s ?? 0) * 100) / 100, orders: r?.n ?? 0 };
    });
    const count = (sql: string, ...p: unknown[]) => this.db.get<{ n: number }>(sql, ...p)!.n;
    const activeSql = `status = 'active' AND (end_ms = 0 OR end_ms > ?)`;
    return {
      revenue: {
        today: Math.round((paid(dayStart).s ?? 0) * 100) / 100,
        last30: Math.round((paid(dayStart - 29 * DAY).s ?? 0) * 100) / 100,
        total: Math.round((paid(0).s ?? 0) * 100) / 100,
        orders30: paid(dayStart - 29 * DAY).n,
      },
      days,
      stats: {
        activeLicences: count(`SELECT COUNT(*) AS n FROM licences WHERE ${activeSql}`, now),
        lifetime: count(`SELECT COUNT(*) AS n FROM licences WHERE status = 'active' AND end_ms = 0`),
        expiring7: count(`SELECT COUNT(*) AS n FROM licences WHERE status = 'active' AND end_ms > ? AND end_ms < ?`, now, now + 7 * DAY),
        members: count('SELECT COUNT(*) AS n FROM users WHERE last_login_ms > 0'),
        newMembers7: count('SELECT COUNT(*) AS n FROM users WHERE created_ms > ? AND last_login_ms > 0', now - 7 * DAY),
        attention:
          count(`SELECT COUNT(*) AS n FROM orders WHERE status IN ('review','partially_paid','refunded')`) +
          count(`SELECT COUNT(*) AS n FROM chain_transfers WHERE status = 'unmatched'`),
        unmatched: count(`SELECT COUNT(*) AS n FROM chain_transfers WHERE status = 'unmatched'`),
        inProgress: count(`SELECT COUNT(*) AS n FROM orders WHERE status IN ('pending','confirming')`),
        unusedCodes: count(`SELECT COUNT(*) AS n FROM codes WHERE status = 'unused'`),
      },
      planMix: this.db
        .all<{ plan: string; n: number }>(`SELECT plan, COUNT(*) AS n FROM licences WHERE ${activeSql} GROUP BY plan ORDER BY n DESC`, now)
        .map((r) => ({ plan: this.planLabel(r.plan), count: r.n })),
      checkout: {
        provider: 'Direct to your wallet (TRON)',
        configured: !!this.cfg.tron.address,
        payCurrency: 'USDT (TRC20)',
        address: this.cfg.tron.address || null,
        sources: [...new Set([new URL(this.cfg.tron.apiBase).host, new URL(this.cfg.tron.nodeUrl).host])],
        windowMinutes: this.cfg.tron.windowMinutes,
        ...this.orders.watcherState(),
      },
      roleSync: !!(this.cfg.bot.token && this.cfg.bot.guildId && this.cfg.bot.roleId),
    };
  }

  // ---------- orders

  private ordersWhere(q: ListQuery): Where {
    const w = new Where();
    const status = q.status ?? '';
    if (status === 'attention') w.add(`o.status IN ('review','partially_paid','refunded')`);
    else if (status === 'open') w.add(`o.status IN ('pending','confirming')`);
    else if (/^[a-z_]{3,20}$/.test(status)) w.add('o.status = ?', status);
    if (q.plan) w.add('o.plan = ?', q.plan);
    if (q.q) {
      const t = q.q.trim();
      w.add(
        `(o.id LIKE ? ESCAPE '\\' OR o.user_id LIKE ? ESCAPE '\\' OR u.username LIKE ? ESCAPE '\\' OR u.display_name LIKE ? ESCAPE '\\'
          OR o.txid = ? OR o.claimed_txid = ? OR o.payer = ? OR o.amount_micro = ?)`,
        like(t), like(t), like(t), like(t), t.toLowerCase(), t.toLowerCase(), t, /^\d{1,9}(\.\d{1,6})?$/.test(t) ? toMicro(Number(t)) : -1,
      );
    }
    return w;
  }

  listOrders(q: ListQuery): Page<ReturnType<AdminService['orderRow']>> {
    const { page, size, offset } = this.paging(q);
    const w = this.ordersWhere(q);
    const sort = { new: 'o.created_ms DESC', old: 'o.created_ms ASC', amount: 'CAST(o.amount AS REAL) DESC, o.created_ms DESC', updated: 'o.updated_ms DESC' }[q.sort ?? 'new'] ?? 'o.created_ms DESC';
    const from = 'FROM orders o LEFT JOIN users u ON u.id = o.user_id';
    const total = this.db.get<{ n: number }>(`SELECT COUNT(*) AS n ${from} ${w.sql}`, ...w.params)!.n;
    const rows = this.db.all<OrderRow & { username: string | null; display_name: string | null }>(
      `SELECT o.*, u.username, u.display_name ${from} ${w.sql} ORDER BY ${sort} LIMIT ? OFFSET ?`, ...w.params, size, offset,
    );
    return { items: rows.map((r) => this.orderRow(r)), total, page, size };
  }

  private orderRow(r: OrderRow & { username?: string | null; display_name?: string | null }) {
    return {
      id: r.id,
      userId: r.user_id,
      userName: r.display_name || r.username || null,
      plan: r.plan,
      planLabel: this.planLabel(r.plan),
      amount: r.amount,
      status: r.status,
      expected: r.amount_micro ? fromMicro(r.amount_micro, 4) : null,
      received: r.paid_micro ? fromMicro(r.paid_micro) : null,
      txid: r.txid,
      claimedTxid: r.claimed_txid,
      payer: r.payer,
      paidTxAt: r.paid_tx_ms,
      expiresAt: r.expires_ms,
      note: r.note,
      createdAt: r.created_ms,
      updatedAt: r.updated_ms,
      paidAt: r.status === 'paid' ? r.decided_ms : null,
      decidedBy: r.decided_by,
    };
  }

  ordersCsv(q: ListQuery): string {
    const w = this.ordersWhere(q);
    const rows = this.db.all<OrderRow & { username: string | null; display_name: string | null }>(
      `SELECT o.*, u.username, u.display_name FROM orders o LEFT JOIN users u ON u.id = o.user_id ${w.sql} ORDER BY o.created_ms DESC LIMIT 20000`,
      ...w.params,
    );
    const cell = (v: unknown) => {
      let s = v === null || v === undefined ? '' : String(v);
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // no formula injection when opened in Excel
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const iso = (ms: number | null) => (ms ? new Date(ms).toISOString() : '');
    const head = ['order', 'created', 'member', 'discord_id', 'plan', 'price_usdt', 'status', 'paid_at', 'expected_usdt', 'received_usdt', 'txid', 'payer', 'note'];
    const lines = rows.map((r) =>
      [r.id, iso(r.created_ms), r.display_name || r.username || '', r.user_id, this.planLabel(r.plan), r.amount, r.status,
        r.status === 'paid' ? iso(r.decided_ms) : '', r.amount_micro ? fromMicro(r.amount_micro, 4) : '', r.paid_micro ? fromMicro(r.paid_micro) : '',
        r.txid ?? r.claimed_txid ?? '', r.payer ?? '', r.note].map(cell).join(','),
    );
    return [head.join(','), ...lines].join('\n') + '\n';
  }

  // ---------- payments seen on the blockchain

  listTransfers(q: ListQuery): Page<ReturnType<AdminService['transferRow']>> {
    const { page, size, offset } = this.paging(q);
    const w = new Where();
    if (q.status === 'all') {
      /* everything */
    } else if (/^(matched|unmatched|ignored)$/.test(q.status ?? '')) w.add('t.status = ?', q.status);
    else w.add("t.status = 'unmatched'");
    if (q.q) {
      const t = q.q.trim();
      w.add('(t.txid = ? OR t.from_addr = ? OR t.order_id = ? OR t.value_micro = ?)', t.toLowerCase(), t, t.toLowerCase(),
        /^\d{1,9}(\.\d{1,6})?$/.test(t) ? toMicro(Number(t)) : -1);
    }
    const total = this.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM chain_transfers t ${w.sql}`, ...w.params)!.n;
    const rows = this.db.all<TransferRow>(`SELECT * FROM chain_transfers t ${w.sql} ORDER BY t.block_ms DESC LIMIT ? OFFSET ?`, ...w.params, size, offset);
    return { items: rows.map((r) => this.transferRow(r)), total, page, size };
  }

  private transferRow(r: TransferRow) {
    return {
      txid: r.txid,
      from: r.from_addr,
      amount: fromMicro(r.value_micro),
      paidAt: r.block_ms,
      status: r.status,
      orderId: r.order_id,
      note: r.note,
      seenAt: r.seen_ms,
      decidedBy: r.decided_by,
    };
  }

  // ---------- subscriptions (licences)

  listLicences(q: ListQuery) {
    const { page, size, offset } = this.paging(q);
    const now = Date.now();
    const w = new Where();
    switch (q.status) {
      case 'active': w.add(`l.status = 'active' AND (l.end_ms = 0 OR l.end_ms > ?)`, now); break;
      case 'expiring': w.add(`l.status = 'active' AND l.end_ms > ? AND l.end_ms < ?`, now, now + 7 * DAY); break;
      case 'expired': w.add(`l.status = 'active' AND l.end_ms != 0 AND l.end_ms <= ?`, now); break;
      case 'lifetime': w.add(`l.status = 'active' AND l.end_ms = 0`); break;
      case 'revoked': w.add(`l.status = 'revoked'`); break;
    }
    if (q.plan) w.add('l.plan = ?', q.plan);
    if (q.q) w.add(`(l.user_ref LIKE ? ESCAPE '\\' OR u.username LIKE ? ESCAPE '\\' OR u.display_name LIKE ? ESCAPE '\\')`, like(q.q.trim()), like(q.q.trim()), like(q.q.trim()));
    const sort = { expiry: 'CASE WHEN l.end_ms = 0 THEN 1 ELSE 0 END, l.end_ms ASC', new: 'l.created_ms DESC', seen: 'l.last_seen_ms DESC' }[q.sort ?? 'new'] ?? 'l.created_ms DESC';
    const from = 'FROM licences l LEFT JOIN users u ON u.id = l.user_ref';
    const total = this.db.get<{ n: number }>(`SELECT COUNT(*) AS n ${from} ${w.sql}`, ...w.params)!.n;
    const rows = this.db.all<LicenceRow & { username: string | null; display_name: string | null; role_state: number | null }>(
      `SELECT l.*, u.username, u.display_name, u.role_state ${from} ${w.sql} ORDER BY ${sort} LIMIT ? OFFSET ?`, ...w.params, size, offset,
    );
    return { items: rows.map((l) => this.licenceRow(l)), total, page, size };
  }

  private licenceRow(l: LicenceRow & { username?: string | null; display_name?: string | null; role_state?: number | null }) {
    return {
      id: l.id,
      userId: l.user_ref,
      userName: l.display_name || (l.username && l.username !== l.user_ref ? l.username : null),
      plan: l.plan,
      planLabel: this.planLabel(l.plan),
      status: this.licences.effectiveStatus(l),
      lifetime: l.end_ms === 0,
      startedAt: l.start_ms,
      expiresAt: l.end_ms,
      activated: !!l.machine_id,
      keySet: !!l.key_set_ms,
      lastSeenAt: l.last_seen_ms,
      source: l.source,
      role: l.role_state === 1,
    };
  }

  // ---------- members

  listMembers(q: ListQuery) {
    const { page, size, offset } = this.paging(q);
    const now = Date.now();
    const active = `EXISTS (SELECT 1 FROM licences l WHERE l.user_ref = u.id AND l.status = 'active' AND (l.end_ms = 0 OR l.end_ms > ${now}))`;
    const anyLic = `EXISTS (SELECT 1 FROM licences l WHERE l.user_ref = u.id)`;
    const w = new Where();
    switch (q.filter) {
      case 'active': w.add(active); break;
      case 'expired': w.add(`${anyLic} AND NOT ${active}`); break;
      case 'none': w.add(`NOT ${anyLic}`); break;
      case 'banned': w.add('u.banned = 1'); break;
    }
    if (q.q) w.add(`(u.id LIKE ? ESCAPE '\\' OR u.username LIKE ? ESCAPE '\\' OR u.display_name LIKE ? ESCAPE '\\')`, like(q.q.trim()), like(q.q.trim()), like(q.q.trim()));
    const sort = { recent: 'u.last_login_ms DESC', new: 'u.created_ms DESC', spent: 'spent DESC, u.last_login_ms DESC' }[q.sort ?? 'recent'] ?? 'u.last_login_ms DESC';
    const total = this.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM users u ${w.sql}`, ...w.params)!.n;
    const rows = this.db.all<UserRow & { spent: number | null; orders: number; until: number | null; lics: number; role_state: number; in_guild: number | null }>(
      `SELECT u.*,
         (SELECT SUM(CAST(amount AS REAL)) FROM orders o WHERE o.user_id = u.id AND o.status = 'paid') AS spent,
         (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS orders,
         (SELECT COUNT(*) FROM licences l WHERE l.user_ref = u.id) AS lics,
         (SELECT CASE WHEN MIN(l.end_ms) = 0 THEN 0 ELSE MAX(l.end_ms) END FROM licences l WHERE l.user_ref = u.id AND l.status = 'active') AS until
       FROM users u ${w.sql} ORDER BY ${sort} LIMIT ? OFFSET ?`,
      ...w.params, size, offset,
    );
    return {
      items: rows.map((u) => ({
        id: u.id,
        name: u.display_name || u.username,
        username: u.username,
        avatarUrl: u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64` : null,
        banned: !!u.banned,
        owner: this.auth.isAdminId(u.id),
        spent: Math.round((u.spent ?? 0) * 100) / 100,
        orders: u.orders,
        licences: u.lics,
        activeUntil: u.until, // null none, 0 lifetime, else ms (may be in the past)
        role: u.role_state === 1,
        inServer: u.in_guild === null ? null : u.in_guild === 1,
        joinedAt: u.created_ms,
        lastLoginAt: u.last_login_ms,
      })),
      total,
      page,
      size,
    };
  }

  member(id: string) {
    const u = this.auth.user(id);
    if (!u) return null;
    const extra = this.db.get<{ role_state: number; in_guild: number | null }>('SELECT role_state, in_guild FROM users WHERE id = ?', id)!;
    const sessions = this.db.all<{ device: string | null; last_seen_ms: number; created_ms: number; admin: number }>(
      'SELECT device, last_seen_ms, created_ms, admin FROM sessions WHERE user_id = ? AND expires_ms > ? ORDER BY last_seen_ms DESC', id, Date.now(),
    );
    const orders = this.db.all<OrderRow>('SELECT * FROM orders WHERE user_id = ? ORDER BY created_ms DESC LIMIT 100', id);
    return {
      user: {
        id: u.id,
        name: u.display_name || u.username,
        username: u.username,
        avatarUrl: u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64` : null,
        banned: !!u.banned,
        owner: this.auth.isAdminId(u.id),
        joinedAt: u.created_ms,
        lastLoginAt: u.last_login_ms,
        role: extra.role_state === 1,
        inServer: extra.in_guild === null ? null : extra.in_guild === 1,
      },
      spent: Math.round(orders.filter((o) => o.status === 'paid').reduce((s, o) => s + Number(o.amount), 0) * 100) / 100,
      licences: this.licences.forUser(id).map((l) => this.licenceRow({ ...l, role_state: extra.role_state })),
      orders: orders.map((o) => this.orderRow(o)),
      sessions: sessions.map((s) => ({ device: s.device || 'Unknown device', lastSeenAt: s.last_seen_ms, createdAt: s.created_ms, owner: !!s.admin })),
      codes: this.db
        .all<CodeRow>('SELECT * FROM codes WHERE used_by = ? ORDER BY used_ms DESC', id)
        .map((c) => ({ hint: c.hint, plan: this.planLabel(c.plan), days: c.days, usedAt: c.used_ms })),
      events: this.db.all<EventRow>('SELECT * FROM events WHERE user_id = ? ORDER BY id DESC LIMIT 100', id).map((e) => ({ at: e.ts_ms, kind: e.kind, text: e.text })),
    };
  }

  // ---------- redeem keys

  listCodes(q: ListQuery) {
    const { page, size, offset } = this.paging(q);
    const w = new Where();
    if (q.status && ['unused', 'used', 'disabled'].includes(q.status)) w.add('c.status = ?', q.status);
    if (q.batch) w.add('c.batch = ?', q.batch);
    if (q.q) w.add(`(c.hint LIKE ? ESCAPE '\\' OR c.batch LIKE ? ESCAPE '\\' OR c.used_by LIKE ? ESCAPE '\\' OR u.username LIKE ? ESCAPE '\\')`, like(q.q.trim().toUpperCase().slice(-4)), like(q.q.trim()), like(q.q.trim()), like(q.q.trim()));
    const from = 'FROM codes c LEFT JOIN users u ON u.id = c.used_by';
    const total = this.db.get<{ n: number }>(`SELECT COUNT(*) AS n ${from} ${w.sql}`, ...w.params)!.n;
    const rows = this.db.all<CodeRow & { username: string | null; display_name: string | null }>(
      `SELECT c.*, u.username, u.display_name ${from} ${w.sql} ORDER BY c.created_ms DESC LIMIT ? OFFSET ?`, ...w.params, size, offset,
    );
    const batches = this.db.all<{ batch: string; n: number; used: number }>(
      `SELECT batch, COUNT(*) AS n, SUM(status = 'used') AS used FROM codes WHERE batch IS NOT NULL GROUP BY batch ORDER BY MAX(created_ms) DESC LIMIT 50`,
    );
    return {
      items: rows.map((c) => ({
        id: c.id,
        hint: c.hint,
        plan: this.planLabel(c.plan),
        days: c.days,
        status: c.status,
        batch: c.batch,
        createdAt: c.created_ms,
        usedBy: c.used_by,
        usedByName: c.display_name || c.username || null,
        usedAt: c.used_ms,
      })),
      total,
      page,
      size,
      batches,
    };
  }

  // ---------- activity

  listEvents(q: ListQuery) {
    const { page, size, offset } = this.paging(q);
    const w = new Where();
    if (q.kind && /^[a-z]{2,20}$/.test(q.kind)) w.add('e.kind = ?', q.kind);
    if (q.q) w.add(`(e.text LIKE ? ESCAPE '\\' OR e.user_id LIKE ? ESCAPE '\\')`, like(q.q.trim()), like(q.q.trim()));
    const total = this.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM events e ${w.sql}`, ...w.params)!.n;
    const rows = this.db.all<EventRow & { username: string | null; display_name: string | null }>(
      `SELECT e.*, u.username, u.display_name FROM events e LEFT JOIN users u ON u.id = e.user_id ${w.sql} ORDER BY e.id DESC LIMIT ? OFFSET ?`,
      ...w.params, size, offset,
    );
    return {
      items: rows.map((e) => ({ id: e.id, at: e.ts_ms, kind: e.kind, text: e.text, userId: e.user_id, userName: e.display_name || e.username || null })),
      total,
      page,
      size,
    };
  }
}
