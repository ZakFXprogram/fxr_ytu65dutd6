/** Ready-made channel messages the bot can publish or update (install guides, rules, FAQ, templates, updates). */

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
const COL_GREEN = 3066993;

/** The server's channel names, as the posts and bot replies mention them. */
export const CHANNELS: Record<string, string> = {
  downloads: '📥・downloads',
  install: '🛠️・installation',
  support: '🆘・support',
  updates: '🆕・updates',
  rules: '📜・rules',
  faq: '❓・faq',
  trading: '📈・trading',
  setups: '📊・setups',
  templates: '🧩・templates',
};

/** A channel reference for a message, e.g. **#📥・downloads**. */
export function channel(key: keyof typeof CHANNELS | string): string {
  return `**#${CHANNELS[key] ?? key}**`;
}

const FOOTER = 'FXR Fluxora • Order flow for MotiveWave';

/** What changed in each jar version, shown in its release message (versions without notes show none). */
export const RELEASE_NOTES: Record<string, string> = {
  '2.9.4':
    `✨ Nicer first launch: adding the **Loader** now shows the **FXR loading screen** (the logo and a progress bar) while your licence is checked, then it fades out and the studies unlock. Still one single jar, no restart.`,
  '2.9.3':
    `📦 **One single jar.** FXR OrderFlow now ships as one file: the studies appear in **Study → FXR Studies** as soon as you install it (locked until your licence is confirmed), with **no second jar and no restart** needed. Add the **Loader** once to sign in and they unlock. Internally the code is now scrambled to make copying far harder.`,
  '2.9.2':
    `🎨 The default colour theme is now called **BlueWave** (blue / grey). Same colours as before; charts that used it switch over on their own.`,
  '2.9.1':
    `🔧 **CVD · Stops & Icebergs**: the HUD now reads **CVD** (instead of "Volume") and its bars start from a **middle mark**: ` +
    `they grow right when the value is positive, left when it is negative.`,
  '2.9.0':
    `🆕 **New study: CVD · Stops & Icebergs** (a pane under the chart, Bookmap style): the cumulative delta, ` +
    `the running total of **triggered stops** (aggressive orders cascading in the same millisecond after a level breaks) and of ` +
    `**icebergs** (a level that absorbs more than it shows and holds). Live HUD, large events marked, alerts. ` +
    `Menu **Study → FXR Studies → CVD · Stops & Icebergs**.`,
  '2.8.0':
    `🆕 **Two new studies**: **Volume Profile** (composite / per day, week, month / visible range; RTH, full session, ` +
    `overnight or ETH + RTH; Bars, Heatmap, Outline, Holo styles; grey volume + blue / red delta; value area, POC until retested, HVN / LVN) ` +
    `and **TPO Profile** (Sierra-style letters per period, attached volume + delta, value area, singles, poor / excess, IB + extensions, OR, totals). ` +
    `The old **Market Profile** is retired: replace it with **TPO Profile** on your charts.\n\n` +
    `🔧 **Fix**: studies no longer catch clicks on the whole chart (Daily Market Info opened its settings on every click); only what they draw reacts to the mouse.`,
};

/** The jar-release message (the file itself is attached separately). */
export function jarReleaseText(version: string): string {
  const notes = RELEASE_NOTES[version];
  return (
    `📥 **FXR OrderFlow ${version}** for MotiveWave\n\n` +
    (notes ? `${notes}\n\n` : '') +
    `**FXROrderFlow.jar** is attached. An active license is required (**Premium** or **Affiliate** role): check with \`/my-license\`.\n` +
    `Install: follow ${channel('install')} (Windows and macOS). **Close MotiveWave** before replacing the jar.`
  );
}

const TROUBLE =
  `**🛠 Trouble?**\n` +
  `• **🔴 Disconnected** badge / padlock → type \`/my-license\`, otherwise open a ticket in ${'#'}SUPPORT\n` +
  `• Wrong Discord account → open the Loader's settings → **OK** to try again\n` +
  `• Studies stay locked → check the Loader shows a **🟢 Connected** badge; if not, type \`/my-license\`\n`;

function trouble(last: string): string {
  return TROUBLE.replace(`#SUPPORT`, channel('support')) + last;
}

export const POSTS: Post[] = [
  {
    id: 'install_windows',
    title: '🪟 Installation — Windows',
    color: COL_BLUE,
    footer: FOOTER,
    description:
      `**Before you start**\n` +
      `• An active license (**Premium** or **Affiliate** role). Check with \`/my-license\`\n` +
      `• An up-to-date MotiveWave\n\n` +
      `**1 · Download the jar**\nGet \`FXROrderFlow.jar\` in ${channel('downloads')}.\n\n` +
      `**2 · Close MotiveWave completely**\nMenu **File → Exit**. Never replace the jar while MotiveWave is open.\n\n` +
      `**3 · Open the extensions folder**\nPress **Windows + R**, paste the line below, then **Enter**:\n` +
      '```\n%USERPROFILE%\\MotiveWave Extensions\n```' +
      `If it does not exist, create it with this exact name in \`C:\\Users\\<your name>\\\`.\n\n` +
      `**4 · Copy the jar into that folder**\nReplace the old one if Windows asks. There must be **only one** \`FXROrderFlow.jar\`.\n\n` +
      `**5 · Start MotiveWave and add the Loader**\nMenu **Study → FXR OrderFlow → Loader**, add it to a chart. A sign-in page opens → sign in with Discord. A **🟢 Connected** badge appears at the bottom left.\n\n` +
      `**6 · The studies**\nThey are already in **Study → FXR Studies** (Big Trades, Volume Profile, TPO Profile…), shown with a lock until you sign in with the Loader. Once the badge is **🟢 Connected**, they unlock — no restart needed.\n\n` +
      `**🔁 Updating**\nWith MotiveWave closed, replace the jar with the new one.\n\n` +
      trouble(`• Still stuck → open a ticket in ${channel('support')} with a screenshot`),
  },
  {
    id: 'install_mac',
    title: '🍎 Installation — macOS',
    color: COL_GREY,
    footer: FOOTER,
    description:
      `**Before you start**\n` +
      `• An active license (**Premium** or **Affiliate** role). Check with \`/my-license\`\n` +
      `• An up-to-date MotiveWave (same jar as on Windows)\n\n` +
      `**1 · Download the jar**\nGet \`FXROrderFlow.jar\` in ${channel('downloads')}. Don't double-click it: it is not an app.\n\n` +
      `**2 · Quit MotiveWave completely**\n**Cmd + Q** (closing the window is not enough).\n\n` +
      `**3 · Open the extensions folder**\nIn Finder: **Cmd + Shift + G**, paste the line below, then **Enter**:\n` +
      '```\n~/MotiveWave Extensions\n```' +
      `If it does not exist, create it with this exact name in your home folder.\n\n` +
      `**4 · Drag the jar into that folder**\nReplace the old one if macOS asks. There must be **only one** \`FXROrderFlow.jar\`.\n\n` +
      `**5 · Start MotiveWave and add the Loader**\nMenu **Study → FXR OrderFlow → Loader**, add it to a chart. Your browser opens the sign-in page → sign in with Discord. A **🟢 Connected** badge appears at the bottom left.\n\n` +
      `**6 · The studies**\nThey are already in **Study → FXR Studies**, shown with a lock until you sign in with the Loader. Once the badge is **🟢 Connected**, they unlock — no restart needed.\n\n` +
      `**🔁 Updating**\nWith MotiveWave quit, replace the jar with the new one.\n\n` +
      trouble(`• Nothing to allow in System Settings → Privacy: MotiveWave loads the jar`),
  },
  {
    id: 'rules',
    title: '📜 Rules — FXR Fluxora',
    color: COL_PURPLE,
    footer: 'By staying on the server you accept these rules • FXR Fluxora',
    description: 'Welcome to **FXR Fluxora**, the order flow community for MotiveWave. A few simple rules to keep it clean for everyone.',
    fields: [
      { name: '1 · Respect', value: 'No insults, harassment, discrimination or personal fights. Debate ideas and trades, not people.' },
      { name: '2 · No spam or ads', value: 'No flooding, affiliate links, promotion of other groups or unsolicited DMs. Partnerships go through the staff.' },
      { name: '3 · Personal license', value: 'One license = one Discord account. **Sharing, reselling or redistributing the FXR jar, your license or your account is forbidden** and leads to the license being removed immediately, with no refund.' },
      { name: '4 · No cracking', value: 'Any attempt to bypass the license check, decompile or modify the jar leads to a permanent ban.' },
      { name: '5 · The right channel', value: `Install → ${channel('install')}, then a ticket in ${channel('support')}. Analysis and ideas → ${channel('trading')}. Screenshots → ${channel('setups')}. Chart templates → ${channel('templates')}.` },
      { name: '6 · No financial advice', value: 'Nothing here is investment advice. FXR tools help you read order flow; every trading decision is yours.' },
      { name: '⚠️ Risk', value: 'Trading futures and leveraged products carries a high risk of losing money. Only trade money you can afford to lose.' },
      { name: 'Sanctions', value: 'Warning → timeout → ban, depending on severity. The staff has the final word. A problem with a member? Report it to the staff in a ticket.' },
    ],
  },
  {
    id: 'faq',
    title: '❓ FAQ — FXR Fluxora',
    color: COL_BLUE,
    footer: 'Your question is not here? Open a ticket in #🆘・support • FXR Fluxora',
    description: 'The questions we get the most.',
    fields: [
      { name: 'What is FXR Fluxora?', value: 'A suite of **order flow** studies for MotiveWave: Big Trades, Deep Trades, CVD · Stops & Icebergs, Delta Bars, Delta Heatmap, Absorption & Imbalances, Leg to Leg, Volume Profile, TPO Profile and Daily Market Info.' },
      { name: 'Which platform?', value: '**MotiveWave** (recent version), on **Windows** and **macOS**. The same `FXROrderFlow.jar` works on both.' },
      { name: 'Which market data?', value: 'A **tick-by-tick** feed with the aggressor side (bid/ask), e.g. Rithmic or CQG on CME futures. Without tick data the order flow studies stay empty.' },
      { name: 'How do I get a license?', value: 'On the **website** (payment), or with a **key** from the staff: type `/activate` on the server and paste it. The role is given instantly.' },
      { name: 'How do I check my license?', value: 'Type `/my-license`: type, status and end date. The bot also sends you a **private message before it expires**.' },
      { name: 'How does it work in MotiveWave?', value: 'Add **Study → FXR OrderFlow → Loader**: it checks your role through Discord (**Connected** badge at the bottom left), the **FXR Studies** (which are in the menu from the start, locked) then unlock. Everything is in one jar; we **never** get your password.' },
      { name: 'Disconnected badge / padlock', value: 'Your license has expired or you are on another Discord account. Check with `/my-license`. To switch accounts: Loader settings → **OK**.' },
      { name: 'Does it work offline?', value: 'Yes, for up to **72 h** after the last successful check. After that it needs a connection to check again.' },
      { name: 'Several computers?', value: 'Yes, on your own machines with **your** Discord account. Sharing an account or a license is forbidden.' },
      { name: 'How do I update?', value: `When a version is out (${channel('updates')}), download the new jar and replace the old one with MotiveWave closed. Your settings are kept.` },
      { name: 'Need help?', value: `Install: ${channel('install')}. A problem: open a ticket in ${channel('support')} with a screenshot and your MotiveWave version.` },
    ],
  },
  {
    id: 'templates',
    title: '🧩 Chart templates — share yours',
    color: COL_GREEN,
    footer: FOOTER,
    description: 'Share your MotiveWave chart templates and FXR study settings with the other **Premium** members.',
    fields: [
      { name: 'How to share', value: '1. In MotiveWave, save your chart as a template (**right-click the chart → Template → Save As**)\n2. Find the file in your **MotiveWave Extensions / templates** folder\n3. Post it here with a **screenshot**, the **instrument** and **timeframe**, and which **FXR studies** it uses' },
      { name: 'How to import one', value: 'Download the file, put it in your templates folder, then **right-click the chart → Template → Load**.' },
      { name: 'Rules', value: 'Only your own work. No jar, no license, no paid material from others. Keep it about chart setups.' },
    ],
  },
  {
    id: 'launch',
    title: '🚀 FXR Fluxora is live!',
    color: COL_AMBER,
    footer: FOOTER,
    description: 'The **FXR Fluxora** suite is out for MotiveWave: order flow tools built to read **who is hitting the market, where, and how hard**, right on your chart.',
    fields: [
      { name: '🔵 Big Trades', value: 'Large aggressive orders as bubbles, manual or automatic filter and alert tiers.', inline: true },
      { name: '📊 Delta Bars', value: 'Buyer / seller delta of every candle, divergences and extremes.', inline: true },
      { name: '🔥 Delta Heatmap', value: 'Buying and selling pressure price by price, as a heatmap.', inline: true },
      { name: '🧱 Absorption & Imbalances', value: 'Where one side absorbs the other, and order book imbalances.', inline: true },
      { name: '🦵 Leg to Leg', value: 'Volume and delta profiles of every swing leg, HVN / LVN nodes.', inline: true },
      { name: '🗓️ Daily Market Info', value: 'OHLC, value area, OR / IB, VWAP, key opens, gaps and a news calendar.', inline: true },
      { name: '✅ Getting started', value: `1. Get your license on the **website**, or activate your key with \`/activate\`\n2. Download the jar in ${channel('downloads')}\n3. Follow ${channel('install')}\n4. Share your setups in ${channel('setups')}` },
      { name: '📌 Read first', value: `${channel('rules')} and ${channel('faq')}. Welcome, and good trading! 🎯` },
    ],
  },
  {
    id: 'update_2_9_0',
    title: '🆕 Update 2.9 — CVD · Stops & Icebergs',
    color: COL_PURPLE,
    footer: FOOTER,
    description: 'A new study in a pane under the chart, to see **live** what the order book hides.',
    fields: [
      { name: '🔵 CVD', value: 'The cumulative delta, reset every RTH session, every day, at the time you choose, or never.', inline: true },
      { name: '🟠 Stops', value: 'The running total of **triggered stops**: several aggressive orders in the same millisecond right after a level breaks. Buy +, sell -.', inline: true },
      { name: '🟣 Icebergs', value: 'The running total of **hidden orders**: a level that absorbs more than it shows and holds. Hidden bid +, hidden offer -.', inline: true },
      { name: '📟 HUD & alerts', value: 'Live values and bars at the top right (middle mark: right when positive, left when negative), large events marked, alerts on big stop cascades and big icebergs, exported values.' },
      { name: '📥 Install', value: `1. Download the new **FXROrderFlow.jar** in ${channel('downloads')}\n2. **Close MotiveWave**, replace the old jar\n3. Restart, add the **Loader** → **Study → FXR Studies → CVD · Stops & Icebergs**\n\nNeeds tick-by-tick data with bid / ask (Rithmic recommended).` },
    ],
  },
  {
    id: 'update_2_8_0',
    title: '🆕 Update 2.8 — Volume Profile + TPO Profile',
    color: COL_PURPLE,
    footer: FOOTER,
    description: 'Two new studies built on every tick with the buy / sell side. The old **Market Profile** is retired and replaced by **TPO Profile**.',
    fields: [
      { name: '📊 Volume Profile', value: '**Composite**, **Split** (day / week / month) or **Visible Range**. RTH, full session, overnight or ETH + RTH. Bars, Heatmap, Outline, **Holo** styles… **Grey volume + blue / red delta**, bid / ask, ETH / RTH.' },
      { name: '🔤 TPO Profile', value: '**Sierra**-style letters per period (or blocks), attached volume + delta, TPO POC / VP POC, value area, midpoint, **singles extended until filled**, **poor / excess** highs and lows, **IB + extensions**, opening range, totals block.' },
      { name: '🎯 Levels', value: 'Projected lines (extended until retested), labels with prices, tags on the right edge, exported values and touch signals.' },
      { name: '🔧 Fix', value: 'Studies no longer catch clicks on the whole chart: Daily Market Info (and others) used to open their settings on any click. Only what they draw (table, profiles) reacts to the mouse.' },
      { name: '📥 Install', value: `1. Download the new **FXROrderFlow.jar** in ${channel('downloads')}\n2. **Close MotiveWave**, replace the old jar\n3. Restart, add the **Loader** → **Study → FXR Studies → Volume Profile / TPO Profile**\n4. If you had the Market Profile on a chart, remove it and add **TPO Profile**` },
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
