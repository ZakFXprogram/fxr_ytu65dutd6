import { Inject, Injectable, Logger } from '@nestjs/common';
import { createPublicKey, verify as edVerify } from 'node:crypto';
import { CONFIG, type AppConfig } from '../config';
import { DbService } from '../db/db.service';
import {
  LicencesService,
  LIC_ACTIVE,
  parseDuration,
  durationLabel,
  type LicenceKind,
  type LicenceRow,
} from '../licences/licences.service';
import { CodesService, type CodeRow } from '../codes/codes.service';
import { RoleSyncService } from '../roles/role-sync.service';
import { channel } from './posts';
import { caller, ephemeral, sub, INTERACTION_PING, INTERACTION_COMMAND, REPLY_PONG, type Interaction, type Reply } from './commands';

// SubjectPublicKeyInfo DER prefix for an Ed25519 raw public key (RFC 8410).
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

/**
 * Handles Discord slash-command interactions over HTTP: verifies the Ed25519 signature, answers the platform
 * PING, and runs the licence/key commands against the same services the website uses. Replies are always
 * private to the caller. This replaces FXR Manager's bot — the site is now the single source of truth.
 */
@Injectable()
export class InteractionsService {
  private readonly log = new Logger('Discord');

  constructor(
    private readonly db: DbService,
    private readonly licences: LicencesService,
    private readonly codes: CodesService,
    private readonly roles: RoleSyncService,
    @Inject(CONFIG) private readonly cfg: AppConfig,
  ) {}

  get configured(): boolean {
    return !!this.cfg.bot.publicKey;
  }

  /** Verifies a request came from Discord (signature over `timestamp + rawBody`). */
  verify(signatureHex: string, timestamp: string, rawBody: Buffer): boolean {
    if (!this.cfg.bot.publicKey || !/^[0-9a-f]{128}$/i.test(signatureHex) || !timestamp) return false;
    try {
      const key = createPublicKey({
        key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(this.cfg.bot.publicKey, 'hex')]),
        format: 'der',
        type: 'spki',
      });
      return edVerify(null, Buffer.concat([Buffer.from(timestamp, 'utf8'), rawBody]), key, Buffer.from(signatureHex, 'hex'));
    } catch {
      return false;
    }
  }

  handle(i: Interaction): Reply {
    if (i.type === INTERACTION_PING) return { type: REPLY_PONG };
    if (i.type !== INTERACTION_COMMAND || !i.data) return ephemeral('Unknown command.');
    try {
      switch (i.data.name) {
        case 'my-license':
          return this.myLicence(i);
        case 'activate':
          return this.activate(i);
        case 'license':
          return this.licenceCmd(i);
        case 'key':
          return this.keyCmd(i);
        default:
          return ephemeral('Unknown command.');
      }
    } catch (e) {
      this.log.warn(`command ${i.data.name} failed: ${(e as Error).message}`);
      return ephemeral('⚠️ Something went wrong. Please try again in a moment.');
    }
  }

  // ---------------------------------------------------------------- member commands

  private myLicence(i: Interaction): Reply {
    const me = caller(i);
    const mine = this.licences.forUser(me.id).filter((l) => LicencesService.isActive(l));
    if (mine.length === 0) return ephemeral("You don't have an active FXR license. Use `/activate` with your key, or get one on the website.");
    return ephemeral('🎟️ **Your FXR license**\n' + mine.map((l) => this.licenceLine(l)).join('\n'));
  }

  private activate(i: Interaction): Reply {
    const me = caller(i);
    const key = String(sub(i).opts.get('key') ?? '').trim();
    if (!key) return ephemeral('Enter your key: `/activate key:RDM-XXXX-XXXX-XXXX`.');
    try {
      const r = this.codes.redeem(key, me.id);
      const until = r.days === 0 ? 'for life' : `until ${this.date(r.expiresAt)}`;
      return ephemeral(`✅ Key activated! Your FXR license is active ${until}.\nDownload the jar in ${channel('downloads')}, add **Study → FXR OrderFlow → Loader** in MotiveWave and sign in: the studies appear under **FXR Studies**.`);
    } catch {
      return ephemeral('❌ This key is not valid or has already been used.');
    }
  }

  // ---------------------------------------------------------------- staff: /licence

  private licenceCmd(i: Interaction): Reply {
    if (!this.isStaff(i)) return ephemeral('⛔ Staff only.');
    const { name, opts } = sub(i);
    const by = `discord:${caller(i).id}`;
    switch (name) {
      case 'give': {
        const user = String(opts.get('member'));
        const days = parseDuration(String(opts.get('duration')));
        if (days < 0) return ephemeral('Invalid duration. Examples: `7d`, `30d`, `3m`, `1y`, `lifetime`.');
        const kind = (opts.get('type') as LicenceKind) || 'premium';
        const l = this.licences.grantManual(user, days, kind, by);
        this.roles.syncSoon(user);
        const until = l.end_ms === 0 ? 'for life' : `until ${this.date(l.end_ms)}`;
        return ephemeral(`✅ **${kindLabel(kind)}** license (${durationLabel(days)}) given to <@${user}> — active ${until}.`);
      }
      case 'extend': {
        const user = String(opts.get('member'));
        const days = parseDuration(String(opts.get('duration')));
        if (days <= 0) return ephemeral('Enter a duration to add (e.g. `30d`). For lifetime, use `/license give … lifetime`.');
        const active = this.licences.forUser(user).filter((l) => LicencesService.isActive(l) && l.end_ms !== 0);
        if (active.length === 0) return ephemeral('This member has no active time-limited license. Use `/license give`.');
        for (const l of active) this.licences.extend(l.id, days, by);
        this.roles.syncSoon(user);
        return ephemeral(`✅ <@${user}>'s license extended by ${durationLabel(days)}.`);
      }
      case 'revoke': {
        const user = String(opts.get('member'));
        const active = this.licences.forUser(user).filter((l) => l.status === LIC_ACTIVE);
        if (active.length === 0) return ephemeral('This member has no active license.');
        for (const l of active) this.licences.revoke(l.id, by);
        this.roles.syncSoon(user);
        return ephemeral(`✅ <@${user}>'s license revoked. The role will be removed in a moment.`);
      }
      case 'info': {
        const user = String(opts.get('member'));
        const all = this.licences.forUser(user);
        if (all.length === 0) return ephemeral(`<@${user}> has no license.`);
        return ephemeral(`📋 **<@${user}>'s licenses**\n` + all.map((l) => this.licenceLine(l, true)).join('\n'));
      }
      case 'list': {
        const rows = this.db.all<LicenceRow>(
          `SELECT * FROM licences WHERE status = ? AND (end_ms = 0 OR end_ms > ?) ORDER BY (end_ms = 0) ASC, end_ms ASC LIMIT 25`,
          LIC_ACTIVE, Date.now(),
        );
        if (rows.length === 0) return ephemeral('No active license.');
        return ephemeral('📆 **Active licenses** (soonest expiry first)\n' + rows.map((l) => `• <@${l.user_ref}> — ${kindLabel(l.kind)} — ${l.end_ms === 0 ? 'lifetime' : this.date(l.end_ms)}`).join('\n'));
      }
      default:
        return ephemeral('Unknown subcommand.');
    }
  }

  // ---------------------------------------------------------------- staff: /cle

  private keyCmd(i: Interaction): Reply {
    if (!this.isStaff(i)) return ephemeral('⛔ Staff only.');
    const { name, opts } = sub(i);
    const by = `discord:${caller(i).id}`;
    if (name === 'create') {
      const days = parseDuration(String(opts.get('duration')));
      if (days < 0) return ephemeral('Invalid duration. Examples: `7d`, `30d`, `3m`, `1y`, `lifetime`.');
      const count = Math.max(1, Math.min(25, Number(opts.get('count') ?? 1)));
      const kind = (opts.get('type') as LicenceKind) || 'premium';
      const keys = this.codes.generateByDays(days, count, '', by, kind);
      return ephemeral(`🔑 **${count} ${kindLabel(kind)} key(s) (${durationLabel(days)})** — single use, ready to hand out:\n\`\`\`\n${keys.join('\n')}\n\`\`\`\nKeep them safe: they won't be shown again.`);
    }
    if (name === 'list') {
      const rows = this.db.all<CodeRow>(`SELECT * FROM codes WHERE status = 'unused' ORDER BY created_ms DESC LIMIT 25`);
      if (rows.length === 0) return ephemeral('No unused key.');
      return ephemeral(`🔑 **Unused keys** (${rows.length})\n` + rows.map((c) => `• …${c.hint} — ${kindLabel(c.kind)} — ${c.days === 0 ? 'lifetime' : durationLabel(c.days)}`).join('\n'));
    }
    return ephemeral('Unknown subcommand.');
  }

  // ---------------------------------------------------------------- helpers

  private isStaff(i: Interaction): boolean {
    const id = caller(i).id;
    if (this.cfg.adminIds.has(id)) return true;
    const roles = i.member?.roles ?? [];
    return this.cfg.bot.staffRoleIds.some((r) => roles.includes(r));
  }

  private licenceLine(l: LicenceRow, staff = false): string {
    const status = this.licences.effectiveStatus(l);
    const when = l.end_ms === 0 ? 'lifetime' : `${status === LIC_ACTIVE ? 'until' : 'expired on'} ${this.date(l.end_ms)}`;
    const tag = staff ? ` [${status}]` : '';
    return `• ${kindLabel(l.kind)} — ${when}${tag}`;
  }

  private date(ms: number): string {
    return `<t:${Math.floor(ms / 1000)}:D>`; // Discord renders it in the reader's locale
  }
}

function kindLabel(kind: string): string {
  return kind === 'affilie' ? 'Affiliate' : 'Premium';
}
