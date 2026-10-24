import { Inject, Injectable, Logger } from '@nestjs/common';
import { CONFIG, type AppConfig } from '../config';
import { DbService } from '../db/db.service';
import { BotService, type GuildChannel, type GuildRole, type Overwrite } from './bot.service';
import { slugOf } from './english';
import {
  caller,
  ephemeral,
  FLAG_EPHEMERAL,
  REPLY_DEFERRED,
  REPLY_MESSAGE,
  REPLY_MODAL,
  type Interaction,
  type Reply,
} from './commands';

// permission bits
const VIEW = 1n << 10n;
const SEND = 1n << 11n;
const MANAGE_MESSAGES = 1n << 13n;
const EMBED = 1n << 14n;
const ATTACH = 1n << 15n;
const HISTORY = 1n << 16n;
const MANAGE_CHANNELS = 1n << 4n;
export const MEMBER_PERMS = VIEW | SEND | EMBED | ATTACH | HISTORY;
export const BOT_PERMS = MEMBER_PERMS | MANAGE_MESSAGES | MANAGE_CHANNELS;

export const CHANNEL_TEXT = 0;
export const CHANNEL_CATEGORY = 4;

export interface Reason {
  id: string;
  label: string;
  emoji: string;
  /** What the member should give us, asked in the form. */
  ask: string;
  placeholder: string;
}

export const REASONS: Reason[] = [
  {
    id: 'license',
    label: 'License issue',
    emoji: '🔑',
    ask: 'What happens with your license?',
    placeholder: 'e.g. the Loader shows "Disconnected", my key does not work, I have no Premium role…',
  },
  {
    id: 'install',
    label: 'Installation issue',
    emoji: '🛠️',
    ask: 'What goes wrong during the install?',
    placeholder: 'Your OS (Windows / macOS), MotiveWave version, and what you see (no FXR Studies menu, error…)',
  },
  {
    id: 'payment',
    label: 'Payment / billing',
    emoji: '💳',
    ask: 'What is your payment question?',
    placeholder: 'Order, amount, date, transaction id (never send a private key or a seed)…',
  },
  {
    id: 'other',
    label: 'Other question',
    emoji: '💬',
    ask: 'How can we help?',
    placeholder: 'Tell us everything we need to know…',
  },
];

const CATEGORY_NAME = '🎫 TICKETS';
const STAFF_ROLE_SLUGS = ['support', 'staff', 'moderator', 'moderators', 'mod', 'mods', 'admin', 'admins', 'team'];

/**
 * A small ticket system run by the FXR bot (no third-party bot): a panel in #support with one button per reason;
 * a button opens a short form; sending it creates a private channel that only the member, the staff and the bot
 * can see. The member or the staff closes it with the "Close" button. One open ticket per member.
 */
@Injectable()
export class TicketsService {
  private readonly log = new Logger('Tickets');

  constructor(
    private readonly bot: BotService,
    private readonly db: DbService,
    @Inject(CONFIG) private readonly cfg: AppConfig,
  ) {}

  // ---------------------------------------------------------------- panel

  panelPayload() {
    return {
      embeds: [
        {
          title: '🆘 Need help? Open a ticket',
          color: 4754090,
          description:
            'Pick the reason below. A short form opens, then a **private channel** is created where only you and the staff can talk.\n\n' +
            REASONS.map((r) => `${r.emoji} **${r.label}**`).join('\n') +
            '\n\nBefore opening one, the install guide and the FAQ answer most questions. ' +
            'Type `/my-license` to check your license at any time.',
          footer: { text: 'FXR Fluxora • Support' },
        },
      ],
      components: [
        {
          type: 1,
          components: REASONS.map((r) => ({
            type: 2,
            style: r.id === 'other' ? 2 : 1,
            label: r.label,
            emoji: { name: r.emoji },
            custom_id: `ticket:open:${r.id}`,
          })),
        },
      ],
    };
  }

  /** Posts the panel in a channel, or edits it in place if it is already there. */
  async publishPanel(channelId: string): Promise<{ messageId: string; edited: boolean }> {
    const prev = this.db.getMeta('tickets:panel');
    if (prev) {
      const [ch, msg] = prev.split(':');
      if (ch === channelId) {
        try {
          await this.bot.editMessage(ch, msg, this.panelPayload());
          return { messageId: msg, edited: true };
        } catch {
          /* deleted: post again */
        }
      } else {
        await this.bot.deleteMessage(ch, msg).catch(() => {});
      }
    }
    const id = await this.bot.postMessage(channelId, this.panelPayload());
    this.db.setMeta('tickets:panel', `${channelId}:${id}`);
    return { messageId: id, edited: false };
  }

  // ---------------------------------------------------------------- interactions

  /** True when this button / form belongs to the ticket system. */
  owns(i: Interaction): boolean {
    return (i.data?.custom_id ?? '').startsWith('ticket:');
  }

  handle(i: Interaction): Reply {
    const id = i.data?.custom_id ?? '';
    const [, action, arg] = id.split(':');
    if (action === 'open') return this.form(arg);
    if (action === 'submit') return this.submit(i, arg);
    if (action === 'close') return this.close(i);
    return ephemeral('Unknown action.');
  }

  /** The form a reason button opens. */
  private form(reasonId: string): Reply {
    const r = REASONS.find((x) => x.id === reasonId) ?? REASONS[REASONS.length - 1];
    return {
      type: REPLY_MODAL,
      data: {
        custom_id: `ticket:submit:${r.id}`,
        title: `${r.emoji} ${r.label}`.slice(0, 45),
        components: [
          {
            type: 1,
            components: [
              {
                type: 4,
                custom_id: 'details',
                style: 2,
                label: r.ask.slice(0, 45),
                placeholder: r.placeholder.slice(0, 100),
                min_length: 10,
                max_length: 1500,
                required: true,
              },
            ],
          },
        ],
      },
    };
  }

  /** The form was sent: answer at once, create the channel in the background, then point the member to it. */
  private submit(i: Interaction, reasonId: string): Reply {
    const me = caller(i);
    const details =
      i.data?.components?.flatMap((row) => row.components ?? []).find((c) => c.custom_id === 'details')?.value?.trim() ?? '';
    const reason = REASONS.find((x) => x.id === reasonId) ?? REASONS[REASONS.length - 1];
    const token = i.token ?? '';
    void this.openTicket(me, reason, details)
      .then((text) => this.bot.editInteractionReply(token, { content: text }))
      .catch(async (e) => {
        this.log.warn(`ticket for ${me.id} failed: ${(e as Error).message}`);
        await this.bot
          .editInteractionReply(token, { content: '⚠️ Could not open the ticket. Please try again in a moment, or DM a staff member.' })
          .catch(() => {});
      });
    return { type: REPLY_DEFERRED, data: { flags: FLAG_EPHEMERAL } };
  }

  private async openTicket(me: { id: string; name: string }, reason: Reason, details: string): Promise<string> {
    const existing = this.db.getMeta(`ticket:user:${me.id}`);
    if (existing && (await this.bot.getChannel(existing))) {
      return `You already have an open ticket: <#${existing}>. Close it before opening another one.`;
    }
    const channels = await this.bot.listChannels();
    const roles = await this.bot.listRoles();
    const staff = this.staffRoles(roles);
    const category = await this.ensureCategory(channels, staff);

    const n = Number(this.db.getMeta('tickets:counter') ?? '0') + 1;
    this.db.setMeta('tickets:counter', String(n));
    const handle = me.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 20) || 'member';
    const ch = await this.bot.createChannel(
      {
        name: `${reason.id}-${String(n).padStart(4, '0')}-${handle}`,
        type: CHANNEL_TEXT,
        parent_id: category,
        topic: `Ticket #${n} · ${reason.label} · opened by ${me.name}`,
        permission_overwrites: [
          ...this.privateOverwrites(staff),
          { id: me.id, type: 1, allow: String(MEMBER_PERMS), deny: '0' },
        ],
      },
      `Ticket #${n} for ${me.id}`,
    );
    this.db.setMeta(`ticket:user:${me.id}`, ch.id);
    this.db.setMeta(`ticket:chan:${ch.id}`, me.id);

    const pings = staff.map((r) => `<@&${r.id}>`).join(' ');
    await this.bot.postMessage(ch.id, {
      content: `<@${me.id}> ${pings}`.trim(),
      allowed_mentions: { parse: [], users: [me.id], roles: staff.map((r) => r.id) },
      embeds: [
        {
          title: `${reason.emoji} ${reason.label} — ticket #${n}`,
          color: 4754090,
          description: details.slice(0, 3500) || '_(no details)_',
          fields: [
            {
              name: 'What happens now',
              value:
                'A staff member will answer here. Add screenshots if they help.\n' +
                (reason.id === 'license' ? 'Tip: paste the result of `/my-license`.\n' : '') +
                (reason.id === 'install' ? 'Tip: a screenshot of **Study → FXR OrderFlow** and of the Loader badge helps a lot.\n' : '') +
                'Never share your password, a private key or a seed phrase.',
            },
          ],
          footer: { text: 'Click "Close ticket" once it is solved.' },
        },
      ],
      components: [
        { type: 1, components: [{ type: 2, style: 4, label: 'Close ticket', emoji: { name: '🔒' }, custom_id: 'ticket:close' }] },
      ],
    });
    this.db.logEvent('bot', `Ticket #${n} (${reason.label}) ouvert`, me.id);
    return `✅ Your ticket is open: <#${ch.id}>`;
  }

  /** The member who opened it, or the staff, closes a ticket: the channel is deleted a few seconds later. */
  private close(i: Interaction): Reply {
    const chId = i.channel_id ?? '';
    const owner = this.db.getMeta(`ticket:chan:${chId}`);
    const me = caller(i);
    if (!owner) return ephemeral('This channel is not an open ticket.');
    if (me.id !== owner && !this.isStaff(i)) return ephemeral('⛔ Only the member who opened it or the staff can close this ticket.');
    setTimeout(() => {
      this.bot
        .deleteChannel(chId, `Ticket closed by ${me.id}`)
        .then(() => {
          this.db.run(`DELETE FROM meta WHERE k IN (?, ?)`, `ticket:chan:${chId}`, `ticket:user:${owner}`);
          this.db.logEvent('bot', `Ticket fermé (${chId})`, me.id);
        })
        .catch((e) => this.log.warn(`close ${chId} failed: ${(e as Error).message}`));
    }, 5000);
    return { type: REPLY_MESSAGE, data: { content: `🔒 Ticket closed by <@${me.id}>. This channel will be deleted in 5 seconds.`, allowed_mentions: { parse: [] } } };
  }

  // ---------------------------------------------------------------- helpers

  /** Roles that look like staff (Support, Staff, Moderator…) plus the configured staff roles. */
  staffRoles(roles: GuildRole[]): GuildRole[] {
    const ids = new Set(this.cfg.bot.staffRoleIds);
    return roles.filter((r) => !r.managed && r.name !== '@everyone' && (ids.has(r.id) || STAFF_ROLE_SLUGS.includes(slugOf(r.name))));
  }

  /** Hidden from @everyone, open to the staff roles and the bot. */
  privateOverwrites(staff: GuildRole[]): Overwrite[] {
    return [
      { id: this.bot.guildId, type: 0, allow: '0', deny: String(VIEW) }, // @everyone role id = guild id
      { id: this.bot.botUserId, type: 1, allow: String(BOT_PERMS), deny: '0' },
      ...staff.map((r) => ({ id: r.id, type: 0 as const, allow: String(MEMBER_PERMS | MANAGE_MESSAGES), deny: '0' })),
    ];
  }

  async ensureCategory(channels: GuildChannel[], staff: GuildRole[]): Promise<string> {
    const known = this.db.getMeta('tickets:category');
    if (known && channels.some((c) => c.id === known)) return known;
    const found = channels.find((c) => c.type === CHANNEL_CATEGORY && slugOf(c.name) === 'tickets');
    const id =
      found?.id ??
      (await this.bot.createChannel(
        { name: CATEGORY_NAME, type: CHANNEL_CATEGORY, permission_overwrites: this.privateOverwrites(staff) },
        'Ticket category',
      )).id;
    this.db.setMeta('tickets:category', id);
    return id;
  }

  private isStaff(i: Interaction): boolean {
    const id = caller(i).id;
    if (this.cfg.adminIds.has(id)) return true;
    const roles = i.member?.roles ?? [];
    if (this.cfg.bot.staffRoleIds.some((r) => roles.includes(r))) return true;
    // staff-looking roles are checked by name when the ticket channel was made; their holders see the channel,
    // so anyone with MANAGE_MESSAGES there counts as staff too
    const perms = BigInt((i.member as { permissions?: string } | undefined)?.permissions ?? '0');
    return (perms & MANAGE_MESSAGES) !== 0n;
  }
}
