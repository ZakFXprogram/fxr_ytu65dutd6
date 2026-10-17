/** Discord interaction + application-command shapes we use (only the fields we read). */

export const INTERACTION_PING = 1;
export const INTERACTION_COMMAND = 2;
export const REPLY_PONG = 1;
export const REPLY_MESSAGE = 4;
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
  data?: { name: string; options?: InteractionOption[] };
  member?: { user?: { id: string; username?: string; global_name?: string | null }; roles?: string[] };
  user?: { id: string; username?: string; global_name?: string | null };
}

export interface Reply {
  type: number;
  data?: { content?: string; flags?: number };
}

export function ephemeral(content: string): Reply {
  return { type: REPLY_MESSAGE, data: { content: content.slice(0, 1900), flags: FLAG_EPHEMERAL } };
}

/** The caller's Discord id and display name, whether the command came from a guild or a DM. */
export function caller(i: Interaction): { id: string; name: string } {
  const u = i.member?.user ?? i.user;
  return { id: u?.id ?? '', name: u?.global_name || u?.username || 'toi' };
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
  { name: 'Affilié', value: 'affilie' },
];

/** The slash-command set registered on the guild (replaces FXR Manager's commands). */
export function commandDefinitions(): unknown[] {
  const membre = { type: OPT_USER, name: 'membre', description: 'Le membre', required: true };
  const duree = { type: OPT_STRING, name: 'duree', description: 'Durée : 7j, 30j, 3m, 1a, vie…', required: true, max_length: 30 };
  const kind = { type: OPT_STRING, name: 'type', description: 'Premium (défaut) ou Affilié', choices: kindChoices };
  const note = { type: OPT_STRING, name: 'note', description: 'Note interne (paiement, raison…)', max_length: 200 };
  const raison = { type: OPT_STRING, name: 'raison', description: 'Raison (visible dans les logs)', max_length: 200 };

  return [
    {
      name: 'licence',
      description: 'Gérer les licences FXR (staff)',
      options: [
        { type: OPT_SUB, name: 'donner', description: 'Donner (ou prolonger) une licence à un membre', options: [membre, duree, kind, note] },
        { type: OPT_SUB, name: 'prolonger', description: "Prolonger la licence active d'un membre", options: [membre, duree] },
        { type: OPT_SUB, name: 'retirer', description: "Retirer la licence d'un membre maintenant", options: [membre, raison] },
        { type: OPT_SUB, name: 'info', description: "Voir les licences d'un membre", options: [membre] },
        { type: OPT_SUB, name: 'liste', description: 'Licences actives, de la plus proche expiration à la plus lointaine' },
      ],
    },
    {
      name: 'cle',
      description: 'Clés de licence à distribuer (staff)',
      options: [
        { type: OPT_SUB, name: 'creer', description: 'Créer des clés de licence', options: [duree, { type: OPT_INT, name: 'nombre', description: 'Combien de clés (1 à 25)', min_value: 1, max_value: 25 }, kind, note] },
        { type: OPT_SUB, name: 'liste', description: 'Clés pas encore utilisées' },
      ],
    },
    {
      name: 'activer',
      description: 'Activer ta licence FXR avec une clé',
      options: [{ type: OPT_STRING, name: 'cle', description: 'Ta clé (RDM-XXXX-XXXX-XXXX)', required: true, max_length: 40 }],
    },
    { name: 'ma-licence', description: 'Voir l’état de ta licence FXR' },
  ];
}
