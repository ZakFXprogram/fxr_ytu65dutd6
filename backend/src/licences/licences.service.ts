import { Injectable, Inject } from '@nestjs/common';
import { createHash, randomInt } from 'node:crypto';
import { DbService, newId } from '../db/db.service';
import { CONFIG, type AppConfig } from '../config';

export interface LicenceRow {
  id: string;
  user_ref: string;
  plan: string;
  key_hash: string;
  status: string;
  source: string;
  start_ms: number;
  end_ms: number; // 0 = lifetime
  machine_id: string | null;
  order_id: string | null;
  last_seen_ms: number | null;
  created_ms: number;
  updated_ms: number;
}

export const LIC_ACTIVE = 'active';
export const LIC_EXPIRED = 'expired';
export const LIC_REVOKED = 'revoked';

const KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
const KEY_GROUPS = 4;
const KEY_GROUP_LEN = 4;

function hashKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/** Licence authority: issue keys, validate them for the loader, manage them from the admin. */
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

  private planDays(planId: string): number {
    return this.cfg.plans.find((p) => p.id === planId)?.days ?? 0;
  }

  /** Create a licence and return it with its raw key (never stored). */
  issue(userRef: string, planId: string, source: string, orderId = '', daysOverride?: number): { licence: LicenceRow; key: string } {
    const raw = LicencesService.newKey();
    const now = Date.now();
    const days = daysOverride ?? this.planDays(planId);
    const end = days > 0 ? now + days * 86400_000 : 0;
    const id = newId();
    this.db.run(
      `INSERT INTO licences(id,user_ref,plan,key_hash,status,source,start_ms,end_ms,machine_id,order_id,last_seen_ms,created_ms,updated_ms)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id, userRef, planId, hashKey(raw), LIC_ACTIVE, source, now, end, null, orderId || null, null, now, now,
    );
    this.db.logEvent('issue', `licence ${id} issued to ${userRef} (${planId}) via ${source}`);
    return { licence: this.byId(id)!, key: raw };
  }

  byId(id: string): LicenceRow | undefined {
    return this.db.get<LicenceRow>('SELECT * FROM licences WHERE id = ?', id);
  }

  byKey(raw: string): LicenceRow | undefined {
    return this.db.get<LicenceRow>('SELECT * FROM licences WHERE key_hash = ?', hashKey(LicencesService.normalizeKey(raw)));
  }

  all(): LicenceRow[] {
    return this.db.all<LicenceRow>('SELECT * FROM licences ORDER BY created_ms DESC');
  }

  static isActive(l: LicenceRow, nowMs = Date.now()): boolean {
    return l.status === LIC_ACTIVE && (l.end_ms === 0 || l.end_ms > nowMs);
  }

  /** The effective status shown to a user (active licences past their end read as expired). */
  effectiveStatus(l: LicenceRow): string {
    if (l.status === LIC_ACTIVE && !LicencesService.isActive(l)) return LIC_EXPIRED;
    return l.status;
  }

  revoke(id: string): boolean {
    const l = this.byId(id);
    if (!l) return false;
    this.db.run('UPDATE licences SET status = ?, updated_ms = ? WHERE id = ?', LIC_REVOKED, Date.now(), id);
    this.db.logEvent('revoke', `licence ${id} revoked`);
    return true;
  }

  /** Unbind the machine so the customer can activate on a new computer. */
  resetMachine(id: string): boolean {
    const l = this.byId(id);
    if (!l) return false;
    this.db.run('UPDATE licences SET machine_id = NULL, updated_ms = ? WHERE id = ?', Date.now(), id);
    this.db.logEvent('reset', `licence ${id} machine binding reset`);
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
    if (l.machine_id && l.machine_id !== machineId) return { ok: false, reason: 'licence already activated on another computer' };
    const now = Date.now();
    this.db.run(
      'UPDATE licences SET machine_id = COALESCE(machine_id, ?), last_seen_ms = ?, updated_ms = ? WHERE id = ?',
      machineId, now, now, l.id,
    );
    return { ok: true, plan: l.plan, expiresAt: l.end_ms };
  }

  /** Public status lookup for the "My licence" page. */
  publicStatus(rawKey: string): { found: false } | { found: true; plan: string; status: string; expiresAt: number; lifetime: boolean; activated: boolean } {
    const l = this.byKey(rawKey);
    if (!l) return { found: false };
    return {
      found: true,
      plan: l.plan,
      status: this.effectiveStatus(l),
      expiresAt: l.end_ms,
      lifetime: l.end_ms === 0,
      activated: !!l.machine_id,
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
