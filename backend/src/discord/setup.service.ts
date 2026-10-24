import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { CONFIG, type AppConfig } from '../config';
import { DbService } from '../db/db.service';
import { BotService, type GuildChannel, type Overwrite } from './bot.service';
import { ContentService } from './content.service';
import { TicketsService, CHANNEL_TEXT, MEMBER_PERMS, BOT_PERMS } from './tickets.service';
import { englishName, slugOf } from './english';
import { CHANNELS } from './posts';
import { commandDefinitions } from './commands';

const TYPE_LABEL: Record<number, string> = { 0: 'text', 2: 'voice', 4: 'category', 5: 'announcement', 13: 'stage', 15: 'forum', 16: 'media' };
const VIEW = 1n << 10n;

export interface Rename {
  id: string;
  kind: string;
  from: string;
  to: string;
  unknown: string[];
}

export interface SetupPlan {
  renames: Rename[];
  /** Names with French words the dictionary does not know (left as they are). */
  untranslated: Rename[];
  support: string | null;
  templates: { exists: boolean; name: string; parent: string | null };
}

export interface SetupReport {
  renamed: string[];
  failed: string[];
  untranslated: string[];
  templatesChannel: string | null;
  ticketPanel: string | null;
  postsUpdated: string[];
  jarText: boolean;
  commands: number;
}

/**
 * One-click "switch the server to English": renames French channels / categories / roles, creates the
 * Premium-only #templates channel with its guide, posts the ticket panel in #support, re-edits the bot's own
 * messages in English and re-registers the slash commands. Preview first, then apply. Owner-triggered only.
 */
@Injectable()
export class SetupService {
  private readonly log = new Logger('Setup');

  constructor(
    private readonly bot: BotService,
    private readonly db: DbService,
    private readonly content: ContentService,
    private readonly tickets: TicketsService,
    @Inject(CONFIG) private readonly cfg: AppConfig,
  ) {}

  async preview(): Promise<SetupPlan> {
    const channels = await this.bot.listChannels();
    const roles = await this.bot.listRoles();
    const renames: Rename[] = [];
    const untranslated: Rename[] = [];
    const consider = (id: string, kind: string, name: string) => {
      const c = englishName(name);
      const r = { id, kind, from: name, to: c.to, unknown: c.unknown };
      if (c.to !== name) renames.push(r);
      if (c.unknown.length) untranslated.push(r);
    };
    for (const c of channels) consider(c.id, TYPE_LABEL[c.type] ?? 'channel', c.name);
    for (const r of roles) if (!r.managed && r.name !== '@everyone') consider(r.id, 'role', r.name);

    const support = channels.find((c) => c.type === CHANNEL_TEXT && slugOf(c.name) === 'support') ?? null;
    const tpl = this.findTemplates(channels);
    const setups = channels.find((c) => slugOf(c.name) === 'setups');
    return {
      renames,
      untranslated,
      support: support ? englishName(support.name).to : null,
      templates: { exists: !!tpl, name: tpl?.name ?? CHANNELS.templates, parent: setups?.parent_id ?? null },
    };
  }

  async apply(by: string): Promise<SetupReport> {
    const plan = await this.preview();
    const report: SetupReport = {
      renamed: [],
      failed: [],
      untranslated: plan.untranslated.map((r) => `${r.from} (${r.unknown.join(', ')})`),
      templatesChannel: null,
      ticketPanel: null,
      postsUpdated: [],
      jarText: false,
      commands: 0,
    };

    // 1 · names
    for (const r of plan.renames) {
      try {
        if (r.kind === 'role') await this.bot.patchRole(r.id, { name: r.to }, 'Server in English');
        else await this.bot.patchChannel(r.id, { name: r.to }, 'Server in English');
        report.renamed.push(`${r.from} → ${r.to}`);
      } catch (e) {
        report.failed.push(`${r.from}: ${this.why(e)}`);
      }
      await pause(400);
    }

    const channels = await this.bot.listChannels();
    const roles = await this.bot.listRoles();
    const staff = this.tickets.staffRoles(roles);

    // 2 · #templates, visible to Premium / Affiliate members and the staff only
    try {
      let tpl = this.findTemplates(channels);
      const setups = channels.find((c) => slugOf(c.name) === 'setups');
      const memberRoles = [this.cfg.bot.roleId, this.cfg.bot.affiliateRoleId].filter(Boolean);
      const overwrites: Overwrite[] = [
        { id: this.bot.guildId, type: 0, allow: '0', deny: String(VIEW) },
        { id: this.bot.botUserId, type: 1, allow: String(BOT_PERMS), deny: '0' },
        ...[...memberRoles, ...staff.map((r) => r.id)].map((id) => ({ id, type: 0 as const, allow: String(MEMBER_PERMS), deny: '0' })),
      ];
      const topic = 'Share your MotiveWave chart templates and FXR study settings (Premium members).';
      if (!tpl) {
        tpl = await this.bot.createChannel(
          { name: CHANNELS.templates, type: CHANNEL_TEXT, parent_id: setups?.parent_id ?? null, topic, permission_overwrites: overwrites },
          'Premium templates channel',
        );
        if (setups?.position !== undefined) {
          await this.bot.patchChannel(tpl.id, { position: setups.position + 1 }, 'Place next to setups').catch(() => {});
        }
      } else {
        await this.bot.patchChannel(tpl.id, { topic, permission_overwrites: overwrites }, 'Premium templates channel');
      }
      await this.content.publishPost('templates', tpl.id);
      report.templatesChannel = tpl.name;
    } catch (e) {
      report.failed.push(`#templates: ${this.why(e)}`);
    }

    // 3 · ticket panel in #support
    const support = channels.find((c) => c.type === CHANNEL_TEXT && slugOf(c.name) === 'support');
    if (support) {
      try {
        await this.tickets.ensureCategory(channels, staff);
        await this.tickets.publishPanel(support.id);
        report.ticketPanel = support.name;
      } catch (e) {
        report.failed.push(`ticket panel: ${this.why(e)}`);
      }
    } else {
      report.failed.push('ticket panel: no #support channel found');
    }

    // 4 · the bot's own messages, in English
    for (const p of this.content.availablePosts()) {
      if (!p.posted || p.id === 'templates') continue;
      try {
        await this.content.publishPost(p.id, p.posted.channelId);
        report.postsUpdated.push(p.title);
      } catch (e) {
        report.failed.push(`${p.title}: ${this.why(e)}`);
      }
    }
    try {
      report.jarText = await this.content.refreshJarText();
    } catch (e) {
      report.failed.push(`jar message: ${this.why(e)}`);
    }

    // 5 · slash commands (English names)
    try {
      await this.bot.registerGuildCommands(commandDefinitions());
      report.commands = commandDefinitions().length;
    } catch (e) {
      report.failed.push(`slash commands: ${this.why(e)}`);
    }

    this.db.logEvent('bot', `Serveur passé en anglais (${report.renamed.length} renommés, ${report.failed.length} échecs)`, by);
    return report;
  }

  private findTemplates(channels: GuildChannel[]): GuildChannel | undefined {
    return channels.find((c) => c.type === CHANNEL_TEXT && ['templates', 'template'].includes(slugOf(c.name)));
  }

  private why(e: unknown): string {
    const status = (e as { status?: number }).status;
    if (status === 403) return 'missing permission (the bot needs "Manage Channels" and "Manage Roles", and its role above the roles it edits)';
    if (status === 429) return 'rate limited, run it again in a minute';
    return (e as Error).message?.slice(0, 160) || 'error';
  }
}

function pause(ms: number): Promise<void> {
  return new Promise((ok) => setTimeout(ok, ms));
}
