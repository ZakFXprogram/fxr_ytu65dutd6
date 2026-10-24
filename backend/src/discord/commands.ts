/** Discord interaction + application-command shapes we use (only the fields we read). */

export const INTERACTION_PING = 1;
export const INTERACTION_COMMAND = 2;
export const INTERACTION_COMPONENT = 3;
export const INTERACTION_MODAL = 5;
export const REPLY_PONG = 1;
export const REPLY_MESSAGE = 4;
export const REPLY_DEFERRED = 5;
export const REPLY_MODAL = 9;
export const FLAG_EPHEMERAL = 64;

const OPT_SUB = 1;
const OPT_STRING = 3;
const OPT_INT = 4;
const OPT_USER = 6;

export interface InteractionOption {
  name: string;
  type: number;
  value?: string | number | boolean;
  options?: InteractionOption[];
}

export interface Interaction {
  type: number;
  id?: string;
  token?: string;
  guild_id?: string;
  data?: {
    name: string;
    options?: InteractionOption[];
    /** Buttons and modals. */
    custom_id?: string;
    components?: { components?: { custom_id: string; value?: string }[] }[];
  };
  channel_id?: string;
  member?: { user?: { id: string; username?: string; global_name?: string | null }; roles?: string[] };
  user?: { id: string; username?: string; global_name?: string | null };
}

export interface Reply {
  type: number;
  data?: { content?: string; flags?: number; [k: string]: unknown };
}

export function ephemeral(content: string): Reply {
  return { type: REPLY_MESSAGE, data: { content: content.slice(0, 1900), flags: FLAG_EPHEMERAL } };
}

/** The caller's Discord id and display name, whether the command came from a guild or a DM. */
export function caller(i: Interaction): { id: string; name: string } {
  const u = i.member?.user ?? i.user;
  return { id: u?.id ?? '', name: u?.global_name || u?.username || 'you' };
}

/** The subcommand name and its options, for a command built as a group of subcommands. */
export function sub(i: Interaction): { name: string; opts: Map<string, string | number | boolean> } {
  const top = i.data?.options?.[0];
  const opts = new Map<string, string | number | boolean>();
  if (top && top.type === OPT_SUB) {
    for (const o of top.options ?? []) if (o.value !== undefined) opts.set(o.name, o.value);
    return { name: top.name, opts };
  }
  for (const o of i.data?.options ?? []) if (o.value !== undefined) opts.set(o.name, o.value);
  return { name: '', opts };
}

const kindChoices = [
  { name: 'Premium', value: 'premium' },
  { name: 'Affiliate', value: 'affilie' },
];

/** The slash-command set registered on the guild (replaces FXR Manager's commands). */
export function commandDefinitions(): unknown[] {
  const member = { type: OPT_USER, name: 'member', description: 'The member', required: true };
  const duration = { type: OPT_STRING, name: 'duration', description: 'Duration: 7d, 30d, 3m, 1y, lifetime…', required: true, max_length: 30 };
  const kind = { type: OPT_STRING, name: 'type', description: 'Premium (default) or Affiliate', choices: kindChoices };
  const note = { type: OPT_STRING, name: 'note', description: 'Internal note (payment, reason…)', max_length: 200 };
  const reason = { type: OPT_STRING, name: 'reason', description: 'Reason (shown in the logs)', max_length: 200 };

  return [
    {
      name: 'license',
      description: 'Manage FXR licenses (staff)',
      options: [
        { type: OPT_SUB, name: 'give', description: 'Give (or extend) a license to a member', options: [member, duration, kind, note] },
        { type: OPT_SUB, name: 'extend', description: "Extend a member's active license", options: [member, duration] },
        { type: OPT_SUB, name: 'revoke', description: "Revoke a member's license now", options: [member, reason] },
        { type: OPT_SUB, name: 'info', description: "Show a member's licenses", options: [member] },
        { type: OPT_SUB, name: 'list', description: 'Active licenses, soonest expiry first' },
      ],
    },
    {
      name: 'key',
      description: 'License keys to hand out (staff)',
      options: [
        { type: OPT_SUB, name: 'create', description: 'Create license keys', options: [duration, { type: OPT_INT, name: 'count', description: 'How many keys (1 to 25)', min_value: 1, max_value: 25 }, kind, note] },
        { type: OPT_SUB, name: 'list', description: 'Keys not used yet' },
      ],
    },
    {
      name: 'activate',
      description: 'Activate your FXR license with a key',
      options: [{ type: OPT_STRING, name: 'key', description: 'Your key (RDM-XXXX-XXXX-XXXX)', required: true, max_length: 40 }],
    },
    { name: 'my-license', description: 'Check your FXR license' },
  ];
}
