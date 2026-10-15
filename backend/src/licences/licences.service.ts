import { Injectable, Inject } from '@nestjs/common';
import { createHmac, randomInt } from 'node:crypto';
import { DbService, newId } from '../db/db.service';
import { CONFIG, type AppConfig, type Plan } from '../config';
import { sha256 } from '../common/util';

export interface LicenceRow {
  id: string;
  user_ref: string; // Discord user id of the owner
  plan: string;
  key_hash: string;
  status: string;
  source: string;
  start_ms: number;
  end_ms: number; // 0 = lifetime
  machine_id: string | null; // HMAC of the machine id, never the raw value
  order_id: string | null;
  last_seen_ms: number | null;
  created_ms: number;
  updated_ms: number;
  key_set_ms: number | null; // when the owner last generated their key (null = never)
  machine_moved_ms: number | null; // last self-service move to another computer
}

export const LIC_ACTIVE = 'active';
export const LIC_EXPIRED = 'expired';
export const LIC_REVOKED = 'revoked';

const KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
const KEY_GROUPS = 4;
const KEY_GROUP_LEN = 4;
const MOVE_COOLDOWN_MS = 7 * 86400_000;

/**
 * Licence authority. Keys are 80 random bits, stored only as SHA-256. A raw key exists exactly once: in the
 * response to its owner when they generate it from their account. Nobody (not even the panel) can read it back.
 */
@Injectable()
export class LicencesService {
  constructor(
    private readonly db: DbService,
    @Inject(CONFIG) private readonly cfg: AppConfig,
  ) {}

  static normalizeKey(raw: string): string {
    return raw.trim().toUpperCase();
  }

  static newKey(): string {
    let out = 'FXR';
    for (let g = 0; g < KEY_GROUPS; g++) {
      out += '-';
      for (let i = 0; i < KEY_GROUP_LEN; i++) out += KEY_ALPHABET[randomInt(KEY_ALPHABET.length)];
    }
    return out;
  }

  plan(planId: string): Plan | undefined {
    return this.cfg.plans.find((p) => p.id === planId);
  }

  private machineHash(machineId: string): string {
    return createHmac('sha256', this.cfg.appSecret).update('machine:' + machineId).digest('hex');
  }

  /**
   * Gives a member the time they paid for. If they already have a licence that is not revoked, it is extended
   * (same key, same computer); otherwise a new licence is created. Lifetime turns the licence into lifetime.
   */
  grant(userRef: string, planId: string, source: string, orderId = '', daysOverride?: number): LicenceRow {
    const plan = this.plan(planId);
    if (!plan) throw new Error('unknown plan ' + planId);
    const days = daysOverride ?? plan.days;
    const now = Date.now();
    // a licence can be granted to a Discord id that never signed in yet (panel); keep a placeholder member row
    this.db.run(
      `INSERT OR IGNORE INTO users(id, username, display_name, avatar, banned, created_ms, last_login_ms) VALUES (?,?,NULL,NULL,0,?,0)`,
      userRef, userRef, now,
    );
    const current = this.db.get<LicenceRow>(
      `SELECT * FROM licences WHERE user_ref = ? AND status = ? ORDER BY (end_ms = 0) DESC, end_ms DESC LIMIT 1`,
      userRef, LIC_ACTIVE,
    );
    if (current) {
      if (current.end_ms === 0) {
        this.db.logEvent('grant', `licence ${current.id} is already lifetime; ${planId} via ${source} added nothing`, userRef);
        return current;
      }
      const end = days === 0 ? 0 : Math.max(current.end_ms, now) + days * 86400_000;
      this.db.run(
        'UPDATE licences SET plan = ?, end_ms = ?, order_id = COALESCE(?, order_id), updated_ms = ? WHERE id = ?',
        planId, end, orderId || null, now, current.id,
      );
      this.db.logEvent('renew', `licence of ${userRef} extended: ${planId} via ${source}`, userRef);
      return this.byId(current.id)!;
    }
    const id = newId();
    const end = days > 0 ? now + days * 86400_000 : 0;
    // placeholder hash of a key nobody ever sees; the owner generates their real key from their account
    this.db.run(
      `INSERT INTO licences(id,user_ref,plan,key_hash,status,source,start_ms,end_ms,machine_id,order_id,last_seen_ms,created_ms,updated_ms,key_set_ms,machine_moved_ms)
       VALUES (?,?,?,?,?,?,?,?,NULL,?,NULL,?,?,NULL,NULL)`,
      id, userRef, planId, sha256(LicencesService.newKey() + newId()), LIC_ACTIVE, source, now, end, orderId || null, now, now,
    );
    this.db.logEvent('issue', `licence created for ${userRef}: ${planId} via ${source}`, userRef);
    return this.byId(id)!;
  }

  byId(id: string): LicenceRow | undefined {
    return this.db.get<LicenceRow>('SELECT * FROM licences WHERE id = ?', id);
  }

  byKey(raw: string): LicenceRow | undefined {
    return this.db.get<LicenceRow>('SELECT * FROM licences WHERE key_hash = ?', sha256(LicencesService.normalizeKey(raw)));
  }

  forUser(userRef: string): LicenceRow[] {
    return this.db.all<LicenceRow>('SELECT * FROM licences WHERE user_ref = ? ORDER BY created_ms DESC', userRef);
  }

  all(): LicenceRow[] {
    return this.db.all<LicenceRow>('SELECT * FROM licences ORDER BY created_ms DESC');
  }

  static isActive(l: LicenceRow, nowMs = Date.now()): boolean {
    return l.status === LIC_ACTIVE && (l.end_ms === 0 || l.end_ms > nowMs);
  }

  effectiveStatus(l: LicenceRow): string {
    if (l.status === LIC_ACTIVE && !LicencesService.isActive(l)) return LIC_EXPIRED;
    return l.status;
  }

  /** Owner only: makes a brand-new key, returns it once. The previous key stops working immediately. */
  rotateKey(id: string, userRef: string): string | null {
    const l = this.byId(id);
    if (!l || l.user_ref !== userRef || l.status === LIC_REVOKED) return null;
    const raw = LicencesService.newKey();
    const now = Date.now();
    this.db.run('UPDATE licences SET key_hash = ?, key_set_ms = ?, updated_ms = ? WHERE id = ?', sha256(raw), now, now, id);
    this.db.logEvent('key', 'new licence key generated', userRef);
    return raw;
  }

  /** Owner only: unbind the computer, at most once every 7 days (stops passing one key around). */
  moveMachine(id: string, userRef: string): { ok: boolean; nextMoveAt: number } {
    const l = this.byId(id);
    if (!l || l.user_ref !== userRef || l.status === LIC_REVOKED) return { ok: false, nextMoveAt: 0 };
    const next = (l.machine_moved_ms ?? 0) + MOVE_COOLDOWN_MS;
    const now = Date.now();
    if (!l.machine_id) return { ok: true, nextMoveAt: next };
    if (now < next) return { ok: false, nextMoveAt: next };
    this.db.run('UPDATE licences SET machine_id = NULL, machine_moved_ms = ?, updated_ms = ? WHERE id = ?', now, now, id);
    this.db.logEvent('move', 'computer released (move to another PC)', userRef);
    return { ok: true, nextMoveAt: now + MOVE_COOLDOWN_MS };
  }

  /** Returns the owner's Discord id when something changed (so the caller can sync the role). */
  revoke(id: string, by: string): string | null {
    const l = this.byId(id);
    if (!l || l.status === LIC_REVOKED) return null;
    this.db.run('UPDATE licences SET status = ?, updated_ms = ? WHERE id = ?', LIC_REVOKED, Date.now(), id);
    this.db.logEvent('revoke', `licence of ${l.user_ref} revoked by ${by}`, l.user_ref);
    return l.user_ref;
  }

  /** Adds days to a licence (from today if it already ended). Lifetime licences are left as they are. */
  extend(id: string, days: number, by: string): string | null {
    const l = this.byId(id);
    if (!l || l.status === LIC_REVOKED || l.end_ms === 0) return null;
    const now = Date.now();
    this.db.run('UPDATE licences SET end_ms = ?, updated_ms = ? WHERE id = ?', Math.max(l.end_ms, now) + days * 86400_000, now, id);
    this.db.logEvent('extend', `licence of ${l.user_ref} extended by ${days} days by ${by}`, l.user_ref);
    return l.user_ref;
  }

  resetMachine(id: string, by: string): boolean {
    const l = this.byId(id);
    if (!l) return false;
    this.db.run('UPDATE licences SET machine_id = NULL, updated_ms = ? WHERE id = ?', Date.now(), id);
    this.db.logEvent('reset', `computer of ${l.user_ref} reset by ${by}`, l.user_ref);
    return true;
  }

  /** Loader authentication: validate a key for a machine, binding it on first use. */
  authenticate(rawKey: string, machineId: string): { ok: true; plan: string; expiresAt: number } | { ok: false; reason: string } {
    const key = LicencesService.normalizeKey(rawKey);
    machineId = machineId.trim();
    if (!key || !machineId || machineId.length > 128) return { ok: false, reason: 'key and machine id required' };
    const l = this.byKey(key);
    if (!l) return { ok: false, reason: 'unknown key' };
    if (l.status === LIC_REVOKED) return { ok: false, reason: 'licence revoked' };
    if (!LicencesService.isActive(l)) return { ok: false, reason: 'licence expired' };
    const mh = this.machineHash(machineId);
    if (l.machine_id && l.machine_id !== mh) return { ok: false, reason: 'licence already activated on another computer' };
    const now = Date.now();
    this.db.run(
      'UPDATE licences SET machine_id = COALESCE(machine_id, ?), last_seen_ms = ?, updated_ms = ? WHERE id = ?',
      mh, now, now, l.id,
    );
    return { ok: true, plan: l.plan, expiresAt: l.end_ms };
  }

  /** The member's view of their licence. */
  view(l: LicenceRow) {
    const now = Date.now();
    const nextMoveAt = (l.machine_moved_ms ?? 0) + MOVE_COOLDOWN_MS;
    return {
      id: l.id,
      plan: l.plan,
      planLabel: this.plan(l.plan)?.label ?? l.plan,
      status: this.effectiveStatus(l),
      lifetime: l.end_ms === 0,
      expiresAt: l.end_ms,
      activated: !!l.machine_id,
      keySetAt: l.key_set_ms ?? 0,
      canMove: !!l.machine_id && now >= nextMoveAt,
      nextMoveAt: now >= nextMoveAt ? 0 : nextMoveAt,
    };
  }

  stats(): { total: number; active: number; expiringSoon: number } {
    const now = Date.now();
    const rows = this.all();
    let active = 0;
    let soon = 0;
    for (const l of rows) {
      if (LicencesService.isActive(l, now)) {
        active++;
        if (l.end_ms !== 0 && l.end_ms - now < 7 * 86400_000) soon++;
      }
    }
    return { total: rows.length, active, expiringSoon: soon };
  }
}
