/**
 * Turns the server's French channel / category / role names into English, keeping their emoji prefix and
 * separator ("📥・téléchargements" → "📥・downloads", "📌 INFORMATIONS" → "📌 INFORMATION"). Pure functions:
 * the setup service applies the result.
 */

/** Whole-slug phrases, matched first (accent-free, lower case, words joined by "-"). */
const PHRASES: Record<string, string> = {
  'mises-a-jour': 'updates',
  'mise-a-jour': 'updates',
  'hors-sujet': 'off-topic',
  'commandes-bot': 'bot-commands',
  'commandes-du-bot': 'bot-commands',
  'questions-reponses': 'q-and-a',
  'salon-vocal': 'voice',
  'salons-vocaux': 'voice-channels',
  'nouveaux-membres': 'new-members',
  'prise-de-position': 'trade-ideas',
  'idees-de-trade': 'trade-ideas',
  'zone-de-trading': 'trading-floor',
  'salle-de-trading': 'trading-room',
  'mes-trades': 'my-trades',
  'journal-de-trading': 'trading-journal',
  'a-propos': 'about',
  'premiers-pas': 'getting-started',
  'commencer-ici': 'start-here',
  'demarrer-ici': 'start-here',
  'pour-commencer': 'getting-started',
};

/** Single words (accent-free, lower case). */
const WORDS: Record<string, string> = {
  general: 'general',
  generale: 'general',
  annonce: 'announcement',
  annonces: 'announcements',
  bienvenue: 'welcome',
  accueil: 'welcome',
  regle: 'rule',
  regles: 'rules',
  reglement: 'rules',
  telechargement: 'download',
  telechargements: 'downloads',
  installation: 'installation',
  installations: 'installation',
  aide: 'help',
  support: 'support',
  discussion: 'chat',
  discussions: 'chat',
  blabla: 'chat',
  presentation: 'introductions',
  presentations: 'introductions',
  suggestion: 'suggestion',
  suggestions: 'suggestions',
  resultat: 'result',
  resultats: 'results',
  analyse: 'analysis',
  analyses: 'analysis',
  actualite: 'news',
  actualites: 'news',
  actus: 'news',
  nouvelles: 'news',
  informations: 'information',
  information: 'information',
  infos: 'info',
  info: 'info',
  communaute: 'community',
  role: 'role',
  roles: 'roles',
  ticket: 'ticket',
  tickets: 'tickets',
  partenaire: 'partner',
  partenaires: 'partners',
  partenariat: 'partnership',
  partenariats: 'partnerships',
  temoignage: 'testimonial',
  temoignages: 'testimonials',
  avis: 'reviews',
  gains: 'wins',
  pertes: 'losses',
  idee: 'idea',
  idees: 'ideas',
  outil: 'tool',
  outils: 'tools',
  ressource: 'resource',
  ressources: 'resources',
  formation: 'training',
  formations: 'training',
  education: 'education',
  marche: 'market',
  marches: 'markets',
  graphique: 'chart',
  graphiques: 'charts',
  journal: 'journal',
  medias: 'media',
  media: 'media',
  liens: 'links',
  lien: 'link',
  moderation: 'moderation',
  moderateur: 'moderator',
  moderateurs: 'moderators',
  equipe: 'team',
  staff: 'staff',
  logs: 'logs',
  log: 'log',
  commandes: 'commands',
  commande: 'command',
  boutique: 'shop',
  abonnement: 'subscription',
  abonnements: 'subscriptions',
  licence: 'license',
  licences: 'licenses',
  paiement: 'payment',
  paiements: 'payments',
  question: 'question',
  questions: 'questions',
  retours: 'feedback',
  retour: 'feedback',
  debutant: 'beginner',
  debutants: 'beginners',
  vocal: 'voice',
  vocaux: 'voice',
  salon: 'lounge',
  salons: 'channels',
  detente: 'lounge',
  textuel: 'text',
  textuels: 'text',
  divers: 'misc',
  autres: 'other',
  autre: 'other',
  affilie: 'affiliate',
  affilies: 'affiliates',
  membre: 'member',
  membres: 'members',
  administrateur: 'admin',
  administrateurs: 'admins',
  admin: 'admin',
  proprietaire: 'owner',
  fondateur: 'founder',
  createur: 'creator',
  bot: 'bot',
  bots: 'bots',
  verifie: 'verified',
  verification: 'verification',
  nouveaute: 'new',
  nouveautes: "what's-new",
  evenement: 'event',
  evenements: 'events',
  live: 'live',
  direct: 'live',
  cours: 'lessons',
  video: 'video',
  videos: 'videos',
  captures: 'screenshots',
  capture: 'screenshot',
  sondage: 'poll',
  sondages: 'polls',
  jeux: 'games',
  musique: 'music',
  aleatoire: 'random',
  strategie: 'strategy',
  strategies: 'strategies',
  gestion: 'management',
  risque: 'risk',
  risques: 'risks',
  psychologie: 'psychology',
  entrainement: 'practice',
  reunion: 'meeting',
  bourse: 'stocks',
  crypto: 'crypto',
  matieres: 'commodities',
  indices: 'indices',
  et: 'and',
  de: 'of',
  du: 'of',
  des: 'of',
  la: 'the',
  le: 'the',
  les: 'the',
  mon: 'my',
  mes: 'my',
};

export interface NameChange {
  from: string;
  to: string;
  /** Words with no known English translation (left as they were). */
  unknown: string[];
}

export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** The English version of a channel / category / role name, plus the words it could not translate. */
export function englishName(name: string): NameChange {
  // prefix = everything before the first letter or digit (emoji, "・", "|", "┃", spaces…)
  const m = /^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u.exec(name);
  if (!m) return { from: name, to: name, unknown: [] };
  const [, prefix, body, suffix] = m;
  if (!body) return { from: name, to: name, unknown: [] };

  // separators kept as they are written: "-" in text channels, " " in categories / roles
  const sep = body.includes(' ') ? ' ' : '-';
  const words = body.split(/[\s\-_]+/).filter(Boolean);
  const key = stripAccents(words.join('-').toLowerCase()).replace(/[’']/g, '-');
  const unknown: string[] = [];

  let out: string[];
  if (PHRASES[key]) {
    out = PHRASES[key].split('-').map((t, i) => caseLike(words[Math.min(i, words.length - 1)], t));
  } else {
    out = words.map((w) => {
      const k = stripAccents(w.toLowerCase());
      // French elisions: l'analyse, d'installation
      const bare = /^(?:l|d|j|qu)[’'](.+)$/.exec(k)?.[1] ?? k;
      const t = WORDS[bare];
      if (t) return caseLike(w, t);
      if (w !== stripAccents(w)) unknown.push(w); // an accented word we don't know is surely French
      return w;
    });
    // drop articles left at the start ("les-regles" → "rules")
    while (out.length > 1 && ['the', 'of'].includes(out[0].toLowerCase())) out.shift();
  }
  const text = out.join(sep);
  return { from: name, to: prefix + text + suffix, unknown };
}

/** The translation written in the case of the word it replaces (ANNONCES → ANNOUNCEMENTS, Affilié → Affiliate). */
function caseLike(orig: string, t: string): string {
  if (orig.length > 1 && orig === orig.toUpperCase() && orig !== orig.toLowerCase()) return t.toUpperCase();
  if (/^\p{Lu}/u.test(orig)) return t.charAt(0).toUpperCase() + t.slice(1);
  return t;
}

/** The bare English slug of a name ("📥・downloads" → "downloads"), to find a channel by meaning. */
export function slugOf(name: string): string {
  return stripAccents(englishName(name).to)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
