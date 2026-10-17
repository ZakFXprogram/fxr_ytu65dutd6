import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { CONFIG, type AppConfig } from '../config';
import { DbService } from '../db/db.service';

export type RoleResult = 'granted' | 'removed' | 'unchanged' | 'not_in_server' | 'disabled' | 'error';

const ACTIVE_SQL = `EXISTS (SELECT 1 FROM licences l WHERE l.user_ref = u.id AND l.status = 'active' AND (l.end_ms = 0 OR l.end_ms > ?))`;

/**
 * Keeps a member's Discord roles in line with their licences: each active licence grants the role for its kind
 * (premium -> member role, affilie -> affiliate role); when none is active, every FXR-managed role is removed.
 * Runs right after each grant/revoke/redeem and as a sweep every 10 minutes (expiries, members who join later).
 * Uses the bot token (needs "Manage Roles" and its own role above the member roles). We only ever remove roles
 * we granted; the set we granted is tracked in users.granted_roles so unrelated roles are never touched.
 */
@Injectable()
export class RoleSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('RoleSync');
  private timer?: NodeJS.Timeout;
  private flushTimer?: NodeJS.Timeout;
  private readonly pending = new Set<string>();
  private pausedUntil = 0;
  private sweeping = false;

  constructor(
    private readonly db: DbService,
    @Inject(CONFIG) private readonly cfg: AppConfig,
  ) {}

  get configured(): boolean {
    const b = this.cfg.bot;
    return !!(b.token && b.guildId && b.roleId);
  }

  /** Every FXR-managed role id (present in config). */
  private managedRoles(): string[] {
    return [this.cfg.bot.roleId, this.cfg.bot.affiliateRoleId].filter(Boolean);
  }

  onModuleInit(): void {
    if (!this.configured) return;
    // Migrate the old single-flag model: a member we had granted the role to now records it in granted_roles.
    this.db.run(
      `UPDATE users SET granted_roles = ? WHERE role_state = 1 AND (granted_roles IS NULL OR granted_roles = '')`,
      this.cfg.bot.roleId,
    );
    this.timer = setInterval(() => void this.sweep(), 10 * 60_000);
    this.timer.unref();
    setTimeout(() => void this.sweep(), 15_000).unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.flushTimer) clearTimeout(this.flushTimer);
  }

  /** Queue a member for a sync in the next half second (coalesces bursts, e.g. bulk actions). */
  syncSoon(userId: string): void {
    if (!this.configured) return;
    this.pending.add(userId);
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => void this.flush(), 500);
      this.flushTimer.unref();
    }
  }

  private async flush(): Promise<void> {
    this.flushTimer = undefined;
    const ids = [...this.pending];
    this.pending.clear();
    for (const id of ids) await this.syncUser(id);
  }

  hasActiveLicence(userId: string): boolean {
    return !!this.db.get(`SELECT 1 FROM users u WHERE u.id = ? AND ${ACTIVE_SQL}`, userId, Date.now());
  }

  /** The roles this member should hold now, from their active licences' kinds (empty = none / configured off). */
  private desiredRoles(userId: string): Set<string> {
    const now = Date.now();
    const kinds = this.db.all<{ kind: string }>(
      `SELECT DISTINCT COALESCE(kind,'premium') AS kind FROM licences WHERE user_ref = ? AND status = 'active' AND (end_ms = 0 OR end_ms > ?)`,
      userId, now,
    );
    const want = new Set<string>();
    for (const { kind } of kinds) {
      const roleId = kind === 'affilie' ? this.cfg.bot.affiliateRoleId : this.cfg.bot.roleId;
      if (roleId) want.add(roleId);
    }
    return want;
  }

  async syncUser(userId: string): Promise<RoleResult> {
    if (!this.configured) return 'disabled';
    if (Date.now() < this.pausedUntil) {
      this.pending.add(userId);
      return 'error';
    }
    const u = this.db.get<{ granted_roles: string | null }>('SELECT granted_roles FROM users WHERE id = ?', userId);
    if (!u) return 'unchanged';
    const managed = new Set(this.managedRoles());
    const granted = new Set((u.granted_roles ?? '').split(',').map((s) => s.trim()).filter(Boolean));
    const want = this.desiredRoles(userId);

    const toAdd = [...want].filter((r) => !granted.has(r));
    const toRemove = [...granted].filter((r) => managed.has(r) && !want.has(r));
    if (toAdd.length === 0 && toRemove.length === 0) return 'unchanged';

    const now = new Set(granted);
    let notInServer = false;
    try {
      for (const roleId of toAdd) {
        const st = await this.call('PUT', userId, roleId);
        if (st === 204 || st === 200) now.add(roleId);
        else if (st === 404) { notInServer = true; break; }
        else return this.save(userId, now, 'error');
      }
      if (!notInServer) {
        for (const roleId of toRemove) {
          const st = await this.call('DELETE', userId, roleId);
          if (st === 204 || st === 200 || st === 404) now.delete(roleId);
          else return this.save(userId, now, 'error');
        }
      }
    } catch (e) {
      this.log.warn(`sync ${userId} failed: ${(e as Error).message}`);
      return this.save(userId, now, 'error');
    }

    if (notInServer) {
      this.db.run('UPDATE users SET in_guild = 0 WHERE id = ?', userId);
      return 'not_in_server';
    }
    const result: RoleResult = toAdd.length ? 'granted' : 'removed';
    if (toAdd.length) this.db.logEvent('role', 'Discord role(s) added', userId);
    if (toRemove.length) this.db.logEvent('role', 'Discord role(s) removed (no matching active licence)', userId);
    this.db.run('UPDATE users SET in_guild = 1 WHERE id = ?', userId);
    return this.save(userId, now, result);
  }

  /** Persists the set of roles we currently grant this member and returns the result verbatim. */
  private save(userId: string, roles: Set<string>, result: RoleResult): RoleResult {
    const csv = [...roles].join(',');
    this.db.run('UPDATE users SET granted_roles = ?, role_state = ? WHERE id = ?', csv, roles.size ? 1 : 0, userId);
    return result;
  }

  /** Grants missing roles and removes expired ones, a few dozen members per run to stay far from rate limits. */
  async sweep(): Promise<void> {
    if (!this.configured || this.sweeping) return;
    this.sweeping = true;
    try {
      const now = Date.now();
      const needGrant = this.db.all<{ id: string }>(`SELECT u.id FROM users u WHERE u.banned = 0 AND ${ACTIVE_SQL} AND (u.granted_roles IS NULL OR u.granted_roles = '') LIMIT 40`, now);
      const maybeRemove = this.db.all<{ id: string }>(`SELECT u.id FROM users u WHERE u.granted_roles IS NOT NULL AND u.granted_roles <> '' AND NOT ${ACTIVE_SQL} LIMIT 40`, now);
      for (const r of [...maybeRemove, ...needGrant]) {
        if (Date.now() < this.pausedUntil) break;
        await this.syncUser(r.id);
        await new Promise((ok) => setTimeout(ok, 250));
      }
    } finally {
      this.sweeping = false;
    }
  }

  private async call(method: 'PUT' | 'DELETE', userId: string, roleId: string): Promise<number> {
    const b = this.cfg.bot;
    const r = await fetch(`${this.cfg.discord.apiBase}/guilds/${b.guildId}/members/${userId}/roles/${roleId}`, {
      method,
      headers: { Authorization: `Bot ${b.token}`, 'X-Audit-Log-Reason': 'FXR licence sync' },
      signal: AbortSignal.timeout(8000),
    });
    if (r.status === 429) {
      const j = (await r.json().catch(() => ({}))) as { retry_after?: number };
      this.pausedUntil = Date.now() + Math.ceil((j.retry_after ?? 5) * 1000);
    }
    return r.status;
  }
}
