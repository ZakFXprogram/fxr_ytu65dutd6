import { Injectable, NotFoundException } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { DbService, newId } from '../db/db.service';
import { LicencesService } from '../licences/licences.service';
import { RoleSyncService } from '../roles/role-sync.service';
import { sha256 } from '../common/util';

export interface CodeRow {
  id: string;
  code_hash: string;
  hint: string;
  plan: string;
  days: number;
  status: string; // unused | used | disabled
  batch: string | null;
  created_by: string;
  created_ms: number;
  used_by: string | null;
  used_ms: number | null;
  licence_id: string | null;
}

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Redeem keys: single-use codes the owner generates (giveaways, partners, resellers). A signed-in member types one
 * in their dashboard and the time is added to their licence on their Discord account, which also gives the role.
 * Codes are 80 random bits, stored as SHA-256 only; the owner sees them once, at generation.
 */
@Injectable()
export class CodesService {
  constructor(
    private readonly db: DbService,
    private readonly licences: LicencesService,
    private readonly roles: RoleSyncService,
  ) {}

  static newCode(): string {
    const g = () => Array.from({ length: 4 }, () => ALPHA[randomInt(ALPHA.length)]).join('');
    return `RDM-${g()}-${g()}-${g()}-${g()}`;
  }

  static normalize(raw: string): string {
    return raw.trim().toUpperCase().replace(/\s+/g, '');
  }

  generate(planId: string, count: number, batch: string, by: string, daysOverride?: number): string[] {
    const plan = this.licences.plan(planId);
    if (!plan) throw new NotFoundException('Unknown plan');
    const days = daysOverride ?? plan.days;
    const out: string[] = [];
    this.db.tx(() => {
      for (let i = 0; i < count; i++) {
        const code = CodesService.newCode();
        this.db.run(
          `INSERT INTO codes(id, code_hash, hint, plan, days, status, batch, created_by, created_ms) VALUES (?,?,?,?,?,'unused',?,?,?)`,
          newId(), sha256(code), code.slice(-4), planId, days, batch || null, by, Date.now(),
        );
        out.push(code);
      }
    });
    this.db.logEvent('codes', `${count} redeem key(s) generated (${plan.label}${batch ? ', batch ' + batch : ''}) by ${by}`);
    return out;
  }

  /** One generic answer for unknown, used or disabled keys: the endpoint does not help anyone guess. */
  redeem(raw: string, userId: string): { plan: string; days: number; expiresAt: number } {
    const hash = sha256(CodesService.normalize(raw));
    const res = this.db.tx(() => {
      const c = this.db.get<CodeRow>('SELECT * FROM codes WHERE code_hash = ?', hash);
      if (!c || c.status !== 'unused') return null;
      const n = this.db.run(`UPDATE codes SET status = 'used', used_by = ?, used_ms = ? WHERE id = ? AND status = 'unused'`, userId, Date.now(), c.id);
      if (!n) return null;
      const lic = this.licences.grant(userId, c.plan, `key ${c.hint}`, '', c.days);
      this.db.run('UPDATE codes SET licence_id = ? WHERE id = ?', lic.id, c.id);
      this.db.logEvent('redeem', `Redeem key …${c.hint} activated (${c.days ? '+' + c.days + ' days' : 'lifetime'})`, userId);
      return { plan: c.plan, days: c.days, expiresAt: this.licences.byId(lic.id)!.end_ms };
    });
    if (!res) throw new NotFoundException('This key is not valid or has already been used.');
    this.roles.syncSoon(userId);
    return res;
  }

  disable(ids: string[], by: string): number {
    let n = 0;
    for (const id of ids) n += this.db.run(`UPDATE codes SET status = 'disabled' WHERE id = ? AND status = 'unused'`, id);
    if (n) this.db.logEvent('codes', `${n} redeem key(s) disabled by ${by}`);
    return n;
  }
}
