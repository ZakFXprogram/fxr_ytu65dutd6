import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { CONFIG, type AppConfig } from '../config';
import { DbService } from '../db/db.service';

export type RoleResult = 'granted' | 'removed' | 'unchanged' | 'not_in_server' | 'disabled' | 'error';

const ACTIVE_SQL = `EXISTS (SELECT 1 FROM licences l WHERE l.user_ref = u.id AND l.status = 'active' AND (l.end_ms = 0 OR l.end_ms > ?))`;

/**
 * Keeps the Discord member role in line with licences: active licence -> role, no active licence -> role removed.
 * Runs right after every grant/revoke/redeem and as a sweep every 10 minutes (expiries, members who joined the
 * server later). Uses the bot token; the bot needs "Manage Roles" and its own role above the member role.
 * We only ever remove the role from people we gave it to (users.role_state = 1).
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

  onModuleInit(): void {
    if (!this.configured) return;
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

  async syncUser(userId: string): Promise<RoleResult> {
    if (!this.configured) return 'disabled';
    if (Date.now() < this.pausedUntil) {
      this.pending.add(userId);
      return 'error';
    }
    const u = this.db.get<{ role_state: number }>('SELECT role_state FROM users WHERE id = ?', userId);
    if (!u) return 'unchanged';
    const want = this.hasActiveLicence(userId);
    try {
      if (want) {
        const st = await this.call('PUT', userId);
        if (st === 204 || st === 200) {
          this.db.run('UPDATE users SET role_state = 1, in_guild = 1 WHERE id = ?', userId);
          if (u.role_state !== 1) this.db.logEvent('role', `Discord role given to ${userId}`, userId);
          return u.role_state === 1 ? 'unchanged' : 'granted';
        }
        if (st === 404) {
          this.db.run('UPDATE users SET in_guild = 0 WHERE id = ?', userId);
          return 'not_in_server';
        }
        return 'error';
      }
      if (u.role_state === 1) {
        const st = await this.call('DELETE', userId);
        if (st === 204 || st === 200 || st === 404) {
          this.db.run('UPDATE users SET role_state = 0 WHERE id = ?', userId);
          this.db.logEvent('role', `Discord role removed from ${userId} (no active licence)`, userId);
          return 'removed';
        }
        return 'error';
      }
      return 'unchanged';
    } catch (e) {
      this.log.warn(`sync ${userId} failed: ${(e as Error).message}`);
      return 'error';
    }
  }

  /** Grants missing roles and removes expired ones, a few dozen members per run to stay far from rate limits. */
  async sweep(): Promise<void> {
    if (!this.configured || this.sweeping) return;
    this.sweeping = true;
    try {
      const now = Date.now();
      const add = this.db.all<{ id: string }>(`SELECT u.id FROM users u WHERE u.role_state = 0 AND u.banned = 0 AND ${ACTIVE_SQL} LIMIT 40`, now);
      const remove = this.db.all<{ id: string }>(`SELECT u.id FROM users u WHERE u.role_state = 1 AND NOT ${ACTIVE_SQL} LIMIT 40`, now);
      for (const r of [...remove, ...add]) {
        if (Date.now() < this.pausedUntil) break;
        await this.syncUser(r.id);
        await new Promise((ok) => setTimeout(ok, 250));
      }
    } finally {
      this.sweeping = false;
    }
  }

  private async call(method: 'PUT' | 'DELETE', userId: string): Promise<number> {
    const b = this.cfg.bot;
    const r = await fetch(`${this.cfg.discord.apiBase}/guilds/${b.guildId}/members/${userId}/roles/${b.roleId}`, {
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
