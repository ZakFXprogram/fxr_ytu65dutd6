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
    if (i.type !== INTERACTION_COMMAND || !i.data) return ephemeral('Commande inconnue.');
    try {
      switch (i.data.name) {
        case 'ma-licence':
          return this.myLicence(i);
        case 'activer':
          return this.activate(i);
        case 'licence':
          return this.licenceCmd(i);
        case 'cle':
          return this.keyCmd(i);
        default:
          return ephemeral('Commande inconnue.');
      }
    } catch (e) {
      this.log.warn(`command ${i.data.name} failed: ${(e as Error).message}`);
      return ephemeral('⚠️ Une erreur est survenue. Réessaie dans un instant.');
    }
  }

  // ---------------------------------------------------------------- member commands

  private myLicence(i: Interaction): Reply {
    const me = caller(i);
    const mine = this.licences.forUser(me.id).filter((l) => LicencesService.isActive(l));
    if (mine.length === 0) return ephemeral("Tu n'as pas de licence FXR active. Utilise `/activer` avec ta clé, ou passe par le site.");
    return ephemeral('🎟️ **Ta licence FXR**\n' + mine.map((l) => this.licenceLine(l)).join('\n'));
  }

  private activate(i: Interaction): Reply {
    const me = caller(i);
    const key = String(sub(i).opts.get('cle') ?? '').trim();
    if (!key) return ephemeral('Donne ta clé : `/activer cle:RDM-XXXX-XXXX-XXXX`.');
    try {
      const r = this.codes.redeem(key, me.id);
      const until = r.days === 0 ? 'à vie' : `jusqu'au ${this.date(r.expiresAt)}`;
      return ephemeral(`✅ Clé activée ! Ta licence FXR est active ${until}.\nTélécharge le jar dans **#📥・téléchargements**, ajoute **Study → FXR OrderFlow → Loader** dans MotiveWave et connecte-toi : les études apparaissent dans **FXR Studies**.`);
    } catch {
      return ephemeral("❌ Cette clé n'est pas valide ou a déjà été utilisée.");
    }
  }

  // ---------------------------------------------------------------- staff: /licence

  private licenceCmd(i: Interaction): Reply {
    if (!this.isStaff(i)) return ephemeral('⛔ Réservé au staff.');
    const { name, opts } = sub(i);
    const by = `discord:${caller(i).id}`;
    switch (name) {
      case 'donner': {
        const user = String(opts.get('membre'));
        const days = parseDuration(String(opts.get('duree')));
        if (days < 0) return ephemeral('Durée invalide. Exemples : `7j`, `30j`, `3m`, `1a`, `vie`.');
        const kind = (opts.get('type') as LicenceKind) || 'premium';
        const l = this.licences.grantManual(user, days, kind, by);
        this.roles.syncSoon(user);
        const until = l.end_ms === 0 ? 'à vie' : `jusqu'au ${this.date(l.end_ms)}`;
        return ephemeral(`✅ Licence **${kindLabel(kind)}** (${durationLabel(days)}) donnée à <@${user}> — active ${until}.`);
      }
      case 'prolonger': {
        const user = String(opts.get('membre'));
        const days = parseDuration(String(opts.get('duree')));
        if (days <= 0) return ephemeral('Donne une durée à ajouter (ex. `30j`). Pour la vie, utilise `/licence donner … vie`.');
        const active = this.licences.forUser(user).filter((l) => LicencesService.isActive(l) && l.end_ms !== 0);
        if (active.length === 0) return ephemeral("Ce membre n'a pas de licence active à durée limitée. Utilise `/licence donner`.");
        for (const l of active) this.licences.extend(l.id, days, by);
        this.roles.syncSoon(user);
        return ephemeral(`✅ Licence de <@${user}> prolongée de ${durationLabel(days)}.`);
      }
      case 'retirer': {
        const user = String(opts.get('membre'));
        const active = this.licences.forUser(user).filter((l) => l.status === LIC_ACTIVE);
        if (active.length === 0) return ephemeral("Ce membre n'a pas de licence active.");
        for (const l of active) this.licences.revoke(l.id, by);
        this.roles.syncSoon(user);
        return ephemeral(`✅ Licence de <@${user}> retirée. Le rôle sera enlevé dans un instant.`);
      }
      case 'info': {
        const user = String(opts.get('membre'));
        const all = this.licences.forUser(user);
        if (all.length === 0) return ephemeral(`<@${user}> n'a aucune licence.`);
        return ephemeral(`📋 **Licences de <@${user}>**\n` + all.map((l) => this.licenceLine(l, true)).join('\n'));
      }
      case 'liste': {
        const rows = this.db.all<LicenceRow>(
          `SELECT * FROM licences WHERE status = ? AND (end_ms = 0 OR end_ms > ?) ORDER BY (end_ms = 0) ASC, end_ms ASC LIMIT 25`,
          LIC_ACTIVE, Date.now(),
        );
        if (rows.length === 0) return ephemeral('Aucune licence active.');
        return ephemeral('📆 **Licences actives** (expiration la plus proche en premier)\n' + rows.map((l) => `• <@${l.user_ref}> — ${kindLabel(l.kind)} — ${l.end_ms === 0 ? 'à vie' : this.date(l.end_ms)}`).join('\n'));
      }
      default:
        return ephemeral('Sous-commande inconnue.');
    }
  }

  // ---------------------------------------------------------------- staff: /cle

  private keyCmd(i: Interaction): Reply {
    if (!this.isStaff(i)) return ephemeral('⛔ Réservé au staff.');
    const { name, opts } = sub(i);
    const by = `discord:${caller(i).id}`;
    if (name === 'creer') {
      const days = parseDuration(String(opts.get('duree')));
      if (days < 0) return ephemeral('Durée invalide. Exemples : `7j`, `30j`, `3m`, `1a`, `vie`.');
      const count = Math.max(1, Math.min(25, Number(opts.get('nombre') ?? 1)));
      const kind = (opts.get('type') as LicenceKind) || 'premium';
      const keys = this.codes.generateByDays(days, count, '', by, kind);
      return ephemeral(`🔑 **${count} clé(s) ${kindLabel(kind)} (${durationLabel(days)})** — à distribuer, usage unique :\n\`\`\`\n${keys.join('\n')}\n\`\`\`\nGarde-les en lieu sûr : elles ne seront plus affichées.`);
    }
    if (name === 'liste') {
      const rows = this.db.all<CodeRow>(`SELECT * FROM codes WHERE status = 'unused' ORDER BY created_ms DESC LIMIT 25`);
      if (rows.length === 0) return ephemeral('Aucune clé en attente.');
      return ephemeral(`🔑 **Clés non utilisées** (${rows.length})\n` + rows.map((c) => `• …${c.hint} — ${kindLabel(c.kind)} — ${c.days === 0 ? 'à vie' : durationLabel(c.days)}`).join('\n'));
    }
    return ephemeral('Sous-commande inconnue.');
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
    const when = l.end_ms === 0 ? 'à vie' : `${status === LIC_ACTIVE ? "jusqu'au" : 'expirée le'} ${this.date(l.end_ms)}`;
    const tag = staff ? ` [${status}]` : '';
    return `• ${kindLabel(l.kind)} — ${when}${tag}`;
  }

  private date(ms: number): string {
    return `<t:${Math.floor(ms / 1000)}:D>`; // Discord renders it in the reader's locale
  }
}

function kindLabel(kind: string): string {
  return kind === 'affilie' ? 'Affilié' : 'Premium';
}
