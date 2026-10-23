/** Ready-made channel messages the bot can publish or update (install guides, rules, FAQ, launch). */

export interface EmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface Post {
  id: string;
  title: string;
  color: number;
  description: string;
  footer?: string;
  fields?: EmbedField[];
}

const COL_BLUE = 4754090;
const COL_GREY = 6055536;
const COL_AMBER = 14725184;
const COL_PURPLE = 8080895;

/** What changed in each jar version, shown in its release message (versions without notes show none). */
export const RELEASE_NOTES: Record<string, string> = {
  '2.9.0':
    `🆕 **Nouvelle étude : CVD · Stops & Icebergs** (panneau sous le graphique, façon Bookmap) — le delta cumulé, ` +
    `le cumul des **stops déclenchés** (cascades d'ordres agressifs dans la même milliseconde après une cassure) et le cumul des ` +
    `**icebergs** (un niveau qui encaisse plus que ce qu'il affiche et tient). HUD en direct, gros événements marqués, alertes. ` +
    `Menu **Study → FXR Studies → CVD · Stops & Icebergs**.`,
  '2.8.0':
    `🆕 **Deux nouvelles études** : **Volume Profile** (composite / par jour, semaine, mois / zone visible ; RTH, session complète, ` +
    `overnight ou ETH + RTH ; styles Bars, Heatmap, Outline, Holo ; volume gris + delta bleu / rouge ; value area, POC jusqu'au retest, HVN / LVN) ` +
    `et **TPO Profile** (lettres par période façon Sierra, volume + delta attachés, value area, singles, poor / excess, IB + extensions, OR, totaux). ` +
    `L'ancien **Market Profile** est retiré : remplace-le par **TPO Profile** sur tes graphiques.\n\n` +
    `🔧 **Correctif** : les études ne captent plus les clics sur tout le graphique (ex. Daily Market Info ouvrait ses paramètres à chaque clic) ; seul ce qu'elles dessinent réagit à la souris.`,
  '2.7.0':
    `🆕 **Nouvelle étude : Volume Profile** — composite, par jour / semaine / mois ou zone visible ; RTH, session complète, ` +
    `overnight ou ETH + RTH séparés ; styles Bars, Heatmap, Outline, Holo… ; volume gris + delta bleu / rouge, bid / ask ou ` +
    `ETH / RTH ; value area, POC prolongé jusqu'au retest, HVN / LVN, niveaux exportés et signaux. Menu **Study → FXR Studies → Volume Profile**.`,
  '2.6.1':
    `🆕 **Nouvelle étude : Market Profile** — lettres TPO (A, B, C…), volume profile en gris avec le profil de delta ` +
    `(bleu acheteurs / rouge vendeurs) par-dessus, ` +
    `value area, POC, TPOC et single prints. Session RTH / Globex / 24 h / horaires perso, profils journaliers, ` +
    `hebdo, mensuels ou composites. Menu **Study → FXR Studies → Market Profile**.`,
};

/** The jar-release message (the file itself is attached separately). */
export function jarReleaseText(version: string): string {
  const notes = RELEASE_NOTES[version];
  return (
    `📥 **FXR OrderFlow ${version}** pour MotiveWave\n\n` +
    (notes ? `${notes}\n\n` : '') +
    `Le fichier **FXROrderFlow.jar** est en pièce jointe. Licence active requise (rôle **Premium** ou **Affilié**) — vérifie avec \`/ma-licence\`.\n` +
    `Installation : suis **#🛠️・installation** (Windows et macOS). MotiveWave **fermé** avant de remplacer le jar.`
  );
}

export const POSTS: Post[] = [
  {
    id: 'install_windows',
    title: '🪟 Installation — Windows',
    color: COL_BLUE,
    footer: 'FXR Fluxora • Order Flow pour MotiveWave',
    description:
      `**Avant de commencer**\n` +
      `• Une licence active (rôle **Premium** ou **Affilié**). Vérifie avec \`/ma-licence\`\n` +
      `• MotiveWave à jour\n\n` +
      `**1 · Télécharge le jar**\nRécupère \`FXROrderFlow.jar\` dans **#📥・téléchargements**.\n\n` +
      `**2 · Ferme complètement MotiveWave**\nMenu **File → Exit**. Le jar ne se remplace jamais avec MotiveWave ouvert.\n\n` +
      `**3 · Ouvre le dossier des extensions**\nTouche **Windows + R**, colle la ligne ci-dessous, puis **Entrée** :\n` +
      '```\n%USERPROFILE%\\MotiveWave Extensions\n```' +
      `S'il n'existe pas, crée-le avec ce nom exact dans \`C:\\Users\\<ton nom>\\\`.\n\n` +
      `**4 · Copie le jar dans ce dossier**\nRemplace l'ancien si Windows le demande. Il ne doit y avoir **qu'un seul** \`FXROrderFlow.jar\`.\n\n` +
      `**5 · Relance MotiveWave et lance le Loader**\nMenu **Study → FXR OrderFlow → Loader**, ajoute-le à un graphique. Une page Discord s'ouvre → clique **Autoriser**. Un badge **🟢 Connected** apparaît en bas à gauche.\n\n` +
      `**6 · Les études**\nUne fois connecté, elles arrivent dans le menu **Study → FXR Studies** (Big Trades, Delta Heatmap, Leg to Leg…). Si le menu ne sort pas tout de suite, relance MotiveWave une fois.\n\n` +
      `**🔁 Mise à jour**\nMotiveWave fermé, remplace le jar par le nouveau.\n\n` +
      `**🛠 Un souci ?**\n` +
      `• Badge **🔴 Disconnected** / cadenas → tape \`/ma-licence\`, sinon **#🆘・support**\n` +
      `• Mauvais compte Discord → ouvre les paramètres du Loader → **OK** pour réessayer\n` +
      `• Menu FXR Studies absent → vérifie que le Loader est connecté (badge vert), puis relance MotiveWave\n` +
      `• Toujours bloqué → **#🆘・support** avec une capture`,
  },
  {
    id: 'install_mac',
    title: '🍎 Installation — macOS',
    color: COL_GREY,
    footer: 'FXR Fluxora • Order Flow pour MotiveWave',
    description:
      `**Avant de commencer**\n` +
      `• Une licence active (rôle **Premium** ou **Affilié**). Vérifie avec \`/ma-licence\`\n` +
      `• MotiveWave à jour (même jar que sur Windows)\n\n` +
      `**1 · Télécharge le jar**\nRécupère \`FXROrderFlow.jar\` dans **#📥・téléchargements**. Ne double-clique pas dessus : ce n'est pas une application.\n\n` +
      `**2 · Quitte complètement MotiveWave**\n**Cmd + Q** (fermer la fenêtre ne suffit pas).\n\n` +
      `**3 · Ouvre le dossier des extensions**\nDans le Finder : **Cmd + Maj + G**, colle la ligne ci-dessous, puis **Entrée** :\n` +
      '```\n~/MotiveWave Extensions\n```' +
      `S'il n'existe pas, crée-le avec ce nom exact dans ton dossier personnel.\n\n` +
      `**4 · Glisse le jar dans ce dossier**\nRemplace l'ancien si le Mac le demande. Il ne doit y avoir **qu'un seul** \`FXROrderFlow.jar\`.\n\n` +
      `**5 · Relance MotiveWave et lance le Loader**\nMenu **Study → FXR OrderFlow → Loader**, ajoute-le à un graphique. Safari ou Chrome s'ouvre sur Discord → clique **Autoriser**. Un badge **🟢 Connected** apparaît en bas à gauche.\n\n` +
      `**6 · Les études**\nUne fois connecté, elles arrivent dans le menu **Study → FXR Studies**. Si le menu ne sort pas tout de suite, relance MotiveWave une fois.\n\n` +
      `**🔁 Mise à jour**\nMotiveWave quitté, remplace le jar par le nouveau.\n\n` +
      `**🛠 Un souci ?**\n` +
      `• Badge **🔴 Disconnected** / cadenas → tape \`/ma-licence\`, sinon **#🆘・support**\n` +
      `• Mauvais compte Discord → ouvre les paramètres du Loader → **OK** pour réessayer\n` +
      `• Menu FXR Studies absent → vérifie que le Loader est connecté (badge vert), puis relance MotiveWave\n` +
      `• Rien à autoriser dans Réglages → Confidentialité : le jar est chargé par MotiveWave`,
  },
  {
    id: 'rules',
    title: '📜 Règlement — FXR Fluxora',
    color: COL_PURPLE,
    footer: 'En restant sur le serveur, tu acceptes ce règlement • FXR Fluxora',
    description: 'Bienvenue sur **FXR Fluxora**, la communauté order flow pour MotiveWave. Quelques règles simples pour que ça reste propre pour tout le monde.',
    fields: [
      { name: '1 · Respect', value: "Pas d'insultes, de harcèlement, de discrimination ni de clash personnel. On débat des idées et des trades, pas des personnes." },
      { name: '2 · Pas de spam ni de pub', value: "Pas de flood, de liens d'affiliation, de promo d'autres groupes ou de MP non sollicités. Les partenariats passent par le staff." },
      { name: '3 · Licence personnelle', value: 'Une licence = un compte Discord. **Partager, revendre ou redistribuer le jar FXR, ta licence ou ton compte est interdit** et entraîne le retrait immédiat de la licence, sans remboursement.' },
      { name: '4 · Pas de piratage', value: 'Toute tentative de contourner la vérification de licence, de décompiler ou de modifier le jar entraîne un bannissement définitif.' },
      { name: '5 · Le bon salon', value: "Installation → **#🛠️・installation** puis **#🆘・support**. Analyses et idées → **#📈・trading**. Captures → **#📊・setups**." },
      { name: '6 · Pas de conseil financier', value: "Rien ici n'est un conseil en investissement. Les outils FXR aident à lire le flux d'ordres ; chaque décision de trading t'appartient." },
      { name: '⚠️ Risques', value: 'Le trading de futures et de produits à effet de levier comporte un risque élevé de perte en capital. Ne trade que de l\'argent que tu peux te permettre de perdre.' },
      { name: 'Sanctions', value: 'Avertissement → exclusion temporaire → bannissement, selon la gravité. Le staff a le dernier mot. Un souci avec un membre ? Signale-le à un **@Support** en privé.' },
    ],
  },
  {
    id: 'faq',
    title: '❓ FAQ — FXR Fluxora',
    color: COL_BLUE,
    footer: "Ta question n'est pas là ? Pose-la dans #🆘・support • FXR Fluxora",
    description: 'Les questions qui reviennent le plus souvent.',
    fields: [
      { name: "C'est quoi FXR Fluxora ?", value: "Une suite d'études **order flow** pour MotiveWave : Big Trades, Deep Trades, CVD · Stops & Icebergs, Delta Bars, Delta Heatmap, Absorption & Imbalances, Leg to Leg, Volume Profile, TPO Profile et Daily Market Info." },
      { name: 'Sur quelle plateforme ?', value: '**MotiveWave** (version récente), sur **Windows** et **macOS**. Le même `FXROrderFlow.jar` sert pour les deux.' },
      { name: 'Quelles données de marché ?', value: 'Un flux **tick par tick** avec le côté agresseur (bid/ask), ex. Rithmic ou CQG sur les futures CME. Sans données tick, les études order flow restent vides.' },
      { name: 'Comment obtenir une licence ?', value: "Via le **site** (paiement), ou une **clé** donnée par le staff : tape `/activer` sur le serveur et colle-la. Le rôle arrive instantanément." },
      { name: 'Comment voir ma licence ?', value: 'Tape `/ma-licence` : type, statut et date de fin. Le bot t\'envoie aussi un **message privé avant l\'expiration**.' },
      { name: 'Comment ça marche dans MotiveWave ?', value: "Ajoute **Study → FXR OrderFlow → Loader** : il vérifie ton rôle via Discord (badge **Connected** en bas à gauche), puis le menu **FXR Studies** apparaît avec toutes les études. On ne reçoit **jamais** ton mot de passe." },
      { name: 'Badge Disconnected / cadenas', value: 'Ta licence a expiré ou tu es sur un autre compte Discord. Vérifie avec `/ma-licence`. Pour changer de compte : paramètres du Loader → **OK**.' },
      { name: 'Ça marche sans internet ?', value: "Oui, jusqu'à **72 h** après la dernière vérification réussie. Ensuite il faut une connexion pour revérifier." },
      { name: 'Plusieurs PC ?', value: 'Oui, sur tes propres machines avec **ton** compte Discord. Le partage de compte ou de licence est interdit.' },
      { name: 'Comment mettre à jour ?', value: 'Quand une version sort (**#🆕・mises-à-jour**), télécharge le nouveau jar et remplace l\'ancien, MotiveWave fermé. Tes réglages sont conservés.' },
      { name: "Besoin d'aide ?", value: 'Installation : **#🛠️・installation**. Problème : **#🆘・support** avec une capture et ta version de MotiveWave.' },
    ],
  },
  {
    id: 'launch',
    title: '🚀 FXR Fluxora est lancé !',
    color: COL_AMBER,
    footer: 'FXR Fluxora • Order Flow pour MotiveWave',
    description: "La suite **FXR Fluxora** arrive sur MotiveWave : des outils order flow pensés pour lire **qui agresse le marché, où, et avec quelle force**, directement sur ton graphique.",
    fields: [
      { name: '🔵 Big Trades', value: "Les gros ordres agressifs en bulles, filtre manuel ou automatique et paliers d'alerte.", inline: true },
      { name: '📊 Delta Bars', value: 'Le delta acheteurs / vendeurs de chaque bougie, divergences et extrêmes.', inline: true },
      { name: '🔥 Delta Heatmap', value: 'La pression acheteuse et vendeuse prix par prix, en carte de chaleur.', inline: true },
      { name: '🧱 Absorption & Imbalances', value: "Les zones où un camp absorbe l'autre et les déséquilibres du carnet.", inline: true },
      { name: '🦵 Leg to Leg', value: 'Profils volume et delta de chaque jambe de swing, nœuds HVN / LVN.', inline: true },
      { name: '🗓️ Daily Market Info', value: 'OHLC, value area, OR / IB, VWAP, opens clés, gaps et calendrier des news.', inline: true },
      { name: '✅ Pour commencer', value: "1. Obtiens ta licence sur le **site**, ou active ta clé avec `/activer`\n2. Télécharge le jar dans **#📥・téléchargements**\n3. Suis **#🛠️・installation**\n4. Partage tes setups dans **#📊・setups**" },
      { name: '📌 À lire', value: '**#📜・règles** et **#❓・faq**. Bienvenue à tous, et bons trades ! 🎯' },
    ],
  },
  {
    id: 'update_2_9_0',
    title: '🆕 Mise à jour 2.9.0 — CVD · Stops & Icebergs',
    color: COL_PURPLE,
    footer: 'FXR Fluxora • Order Flow pour MotiveWave',
    description: "Nouvelle étude en panneau sous le graphique, pour voir **en direct** ce que le carnet cache.",
    fields: [
      { name: '🔵 Volume (CVD)', value: 'Le delta cumulé, remis à zéro à chaque séance RTH, chaque jour, à l\'heure de ton choix, ou jamais.', inline: true },
      { name: '🟠 Stops', value: 'Le cumul des **stops déclenchés** : plusieurs ordres agressifs dans la même milliseconde juste après une cassure. Achat +, vente -.', inline: true },
      { name: '🟣 Icebergs', value: 'Le cumul des **ordres cachés** : un niveau qui encaisse plus que ce qu\'il affiche et qui tient. Bid caché +, offre cachée -.', inline: true },
      { name: '📟 HUD & alertes', value: 'Valeurs et barres en direct en haut à droite, gros événements marqués, alertes sur les grosses cascades et les gros icebergs, valeurs exportées.' },
      { name: '📥 Installer', value: "1. Télécharge le nouveau **FXROrderFlow.jar** dans **#📥・téléchargements**\n2. **Ferme MotiveWave**, remplace l'ancien jar\n3. Relance, lance le **Loader** → **Study → FXR Studies → CVD · Stops & Icebergs**\n\nDonnées tick par tick avec bid / ask nécessaires (Rithmic recommandé)." },
    ],
  },
  {
    id: 'update_2_8_0',
    title: '🆕 Mise à jour 2.8.0 — Volume Profile + TPO Profile',
    color: COL_PURPLE,
    footer: 'FXR Fluxora • Order Flow pour MotiveWave',
    description: "Deux nouvelles études construites sur chaque tick avec le côté acheteur / vendeur. L'ancien **Market Profile** est retiré et remplacé par **TPO Profile**.",
    fields: [
      { name: '📊 Volume Profile', value: '**Composite**, **Split** (jour / semaine / mois) ou **Visible Range**. RTH, session complète, overnight ou ETH + RTH. Styles Bars, Heatmap, Outline, **Holo**… Volume **gris + delta** bleu / rouge, bid / ask, ETH / RTH.' },
      { name: '🔤 TPO Profile', value: 'Lettres par période façon **Sierra** (ou blocs), volume + delta attachés, TPO POC / VP POC, value area, midpoint, **singles prolongés jusqu\'au remplissage**, **poor / excess** high et low, **IB + extensions**, opening range, bloc de totaux.' },
      { name: '🎯 Niveaux', value: 'Lignes projetées (prolongées jusqu\'au retest), étiquettes avec prix, tags sur le bord droit, valeurs exportées et signaux au contact des niveaux.' },
      { name: '🔧 Correctif', value: 'Les études ne captent plus les clics sur tout le graphique : avant, Daily Market Info (et d\'autres) ouvrait ses paramètres dès qu\'on cliquait n\'importe où. Seul ce qu\'elles dessinent (tableau, profils) réagit à la souris.' },
      { name: '📥 Installer', value: "1. Télécharge le nouveau **FXROrderFlow.jar** dans **#📥・téléchargements**\n2. **Ferme MotiveWave**, remplace l'ancien jar\n3. Relance, lance le **Loader** → **Study → FXR Studies → Volume Profile / TPO Profile**\n4. Si tu avais le Market Profile sur un graphique, retire-le et ajoute **TPO Profile**" },
    ],
  },
];

export function postById(id: string): Post | undefined {
  return POSTS.find((p) => p.id === id);
}

/** Builds the Discord embed payload for a post. */
export function postEmbed(p: Post): Record<string, unknown> {
  return {
    title: p.title,
    description: p.description,
    color: p.color,
    fields: p.fields,
    footer: p.footer ? { text: p.footer } : undefined,
  };
}
