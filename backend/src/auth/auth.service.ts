import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { CONFIG, type AppConfig } from '../config';
import { DbService } from '../db/db.service';
import { safeEqual, sanitizeNext, sha256 } from '../common/util';
import type { DiscordUser } from './discord.client';

export interface UserRow {
  id: string;
  username: string;
  display_name: string | null;
  avatar: string | null;
  banned: number;
  created_ms: number;
  last_login_ms: number;
}

export interface SessionRow {
  id_hash: string;
  user_id: string;
  admin: number;
  created_ms: number;
  expires_ms: number;
  last_seen_ms: number;
  device: string | null;
}

export interface AuthContext {
  user: UserRow;
  session: SessionRow;
  /** True only for an allow-listed Discord id that signed in with 2FA on (when required). */
  admin: boolean;
}

declare module 'express' {
  interface Request {
    fxr?: AuthContext;
  }
}

const USER_TTL_MS = 7 * 86400_000;
const ADMIN_TTL_MS = 8 * 3600_000;
const MAX_SESSIONS_PER_USER = 10;
const OAUTH_COOKIE = 'fxr_oauth';
const OAUTH_PATH = '/api/auth';

/**
 * Sessions are server-side: the browser holds a random 256-bit id in an HttpOnly, SameSite=Strict cookie,
 * the database only its SHA-256. Logging out, banning a member, or the expiry deletes the row, which ends the
 * session immediately everywhere.
 */
@Injectable()
export class AuthService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  readonly cookieName: string;

  constructor(
    private readonly db: DbService,
    @Inject(CONFIG) private readonly cfg: AppConfig,
  ) {
    // "__Host-" makes the browser refuse the cookie unless it is Secure, host-only and Path=/.
    this.cookieName = cfg.production ? '__Host-fxr_sid' : 'fxr_sid';
  }

  onModuleInit(): void {
    this.sweep();
    this.timer = setInterval(() => this.sweep(), 15 * 60_000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  isAdminId(id: string): boolean {
    return this.cfg.adminIds.has(id);
  }

  // ---------- OAuth login state (anti-CSRF for the login itself)

  /** Stores a one-time state + the return path in a short-lived cookie scoped to /api/auth. Returns the state. */
  beginLogin(res: Response, next: unknown): string {
    const state = randomBytes(32).toString('base64url');
    const back = Buffer.from(sanitizeNext(next)).toString('base64url');
    res.cookie(OAUTH_COOKIE, `${state}.${back}`, {
      httpOnly: true,
      secure: this.cfg.production,
      sameSite: 'lax', // must survive the top-level redirect back from discord.com
      maxAge: 10 * 60_000,
      path: OAUTH_PATH,
    });
    return state;
  }

  /** Validates the state returned by Discord against the cookie (single use). Returns the return path or null. */
  finishLogin(req: Request, res: Response, state: unknown): string | null {
    const raw = (req.cookies as Record<string, string> | undefined)?.[OAUTH_COOKIE];
    res.clearCookie(OAUTH_COOKIE, { path: OAUTH_PATH });
    if (typeof raw !== 'string' || typeof state !== 'string' || state.length > 128) return null;
    const [s, back] = raw.split('.');
    if (!s || !safeEqual(s, state)) return null;
    return sanitizeNext(Buffer.from(back ?? '', 'base64url').toString());
  }

  // ---------- users

  upsertUser(d: DiscordUser): UserRow {
    const now = Date.now();
    this.db.run(
      `INSERT INTO users(id, username, display_name, avatar, banned, created_ms, last_login_ms)
       VALUES (?,?,?,?,0,?,?)
       ON CONFLICT(id) DO UPDATE SET username = excluded.username, display_name = excluded.display_name,
         avatar = excluded.avatar, last_login_ms = excluded.last_login_ms`,
      d.id, d.username, d.global_name ?? null, d.avatar ?? null, now, now,
    );
    return this.user(d.id)!;
  }

  user(id: string): UserRow | undefined {
    return this.db.get<UserRow>('SELECT * FROM users WHERE id = ?', id);
  }

  setBanned(id: string, banned: boolean): boolean {
    const n = this.db.run('UPDATE users SET banned = ? WHERE id = ?', banned ? 1 : 0, id);
    if (banned) this.revokeUserSessions(id);
    return n > 0;
  }

  // ---------- sessions

  createSession(req: Request, res: Response, userId: string, admin: boolean): void {
    this.destroyCurrent(req); // never reuse a pre-login session id (session fixation)
    const sid = randomBytes(32).toString('base64url');
    const now = Date.now();
    const ttl = admin ? ADMIN_TTL_MS : USER_TTL_MS;
    this.db.run(
      'INSERT INTO sessions(id_hash, user_id, admin, created_ms, expires_ms, last_seen_ms, device) VALUES (?,?,?,?,?,?,?)',
      sha256(sid), userId, admin ? 1 : 0, now, now + ttl, now, deviceLabel(req.get('user-agent')),
    );
    // keep only the most recent sessions of this member
    this.db.run(
      `DELETE FROM sessions WHERE user_id = ? AND id_hash NOT IN
         (SELECT id_hash FROM sessions WHERE user_id = ? ORDER BY created_ms DESC LIMIT ?)`,
      userId, userId, MAX_SESSIONS_PER_USER,
    );
    res.cookie(this.cookieName, sid, {
      httpOnly: true,
      secure: this.cfg.production,
      sameSite: 'strict',
      path: '/',
      maxAge: ttl,
    });
  }

  resolve(req: Request): AuthContext | null {
    const sid = (req.cookies as Record<string, string> | undefined)?.[this.cookieName];
    if (typeof sid !== 'string' || sid.length < 32 || sid.length > 64) return null;
    const session = this.db.get<SessionRow>('SELECT * FROM sessions WHERE id_hash = ?', sha256(sid));
    const now = Date.now();
    if (!session || session.expires_ms <= now) return null;
    const user = this.user(session.user_id);
    if (!user || user.banned) return null;
    if (now - session.last_seen_ms > 60_000) {
      this.db.run('UPDATE sessions SET last_seen_ms = ? WHERE id_hash = ?', now, session.id_hash);
    }
    // the allow-list is re-checked on every request, so removing an id from ADMIN_DISCORD_IDS takes effect at once
    const admin = session.admin === 1 && this.isAdminId(user.id);
    return { user, session, admin };
  }

  logout(req: Request, res: Response): void {
    this.destroyCurrent(req);
    res.clearCookie(this.cookieName, { path: '/', httpOnly: true, secure: this.cfg.production, sameSite: 'strict' });
  }

  revokeUserSessions(userId: string): number {
    return this.db.run('DELETE FROM sessions WHERE user_id = ?', userId);
  }

  /** The member's own sessions. The public id is a prefix of the stored hash: it cannot be used as a cookie. */
  listSessions(userId: string, current: SessionRow) {
    return this.db
      .all<SessionRow>('SELECT * FROM sessions WHERE user_id = ? AND expires_ms > ? ORDER BY last_seen_ms DESC', userId, Date.now())
      .map((s) => ({
        id: s.id_hash.slice(0, 16),
        current: s.id_hash === current.id_hash,
        device: s.device || 'Unknown device',
        createdAt: s.created_ms,
        lastSeenAt: s.last_seen_ms,
        expiresAt: s.expires_ms,
      }));
  }

  revokeSession(userId: string, publicId: string): boolean {
    if (!/^[0-9a-f]{16}$/.test(publicId)) return false;
    return this.db.run('DELETE FROM sessions WHERE user_id = ? AND substr(id_hash, 1, 16) = ?', userId, publicId) > 0;
  }

  revokeOtherSessions(userId: string, current: SessionRow): number {
    return this.db.run('DELETE FROM sessions WHERE user_id = ? AND id_hash != ?', userId, current.id_hash);
  }

  private destroyCurrent(req: Request): void {
    const sid = (req.cookies as Record<string, string> | undefined)?.[this.cookieName];
    if (typeof sid === 'string' && sid.length <= 64) this.db.run('DELETE FROM sessions WHERE id_hash = ?', sha256(sid));
  }

  private sweep(): void {
    this.db.run('DELETE FROM sessions WHERE expires_ms <= ?', Date.now());
  }
}

/** "Chrome on Windows" from a user agent; the raw user agent is not stored. */
export function deviceLabel(ua: string | undefined): string {
  if (!ua) return 'Unknown device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android'
    : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'unknown system';
  return `${browser} on ${os}`;
}

/** What the browser is allowed to know about a member. */
export function publicUser(u: UserRow) {
  return {
    id: u.id,
    name: u.display_name || u.username,
    username: u.username,
    avatarUrl: u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64` : null,
  };
}
