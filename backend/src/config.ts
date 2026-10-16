import { isTronAddress, USDT_CONTRACT } from './payments/tron';

/**
 * Server configuration, read once from the environment (Railway variables). Nothing secret is committed.
 *
 * SECURITY: this service never holds a wallet private key or seed and cannot move funds. Customers pay USDT
 * (TRC20) straight to the owner's public TRON address; the server only READS the blockchain to see what arrived.
 */
export interface Plan {
  id: string;
  label: string;
  price: number; // USDT
  days: number; // 0 = lifetime
}

export interface DiscordConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authorizeUrl: string;
  apiBase: string;
}

export interface TronConfig {
  /** Public receiving address ("T..."). Empty = checkout closed. Never a private key. */
  address: string;
  /** TronGrid-compatible index used to list incoming USDT transfers. */
  apiBase: string;
  apiKey: string;
  /** Node whose confirmed ("solidity") API re-checks every transaction. Point it at another provider for an
   *  independent second source. */
  nodeUrl: string;
  nodeApiKey: string;
  /** Minutes an order's unique amount stays reserved for the customer to pay. */
  windowMinutes: number;
}

export interface DiscordBotConfig {
  token: string;
  guildId: string;
  roleId: string; // role given to members with an active licence
}

export interface AppConfig {
  port: number;
  dataDir: string;
  publicUrl: string;
  origin: string;
  production: boolean;
  /** 32+ random chars. Keys machine-id hashing; changing it forces every customer to re-activate. */
  appSecret: string;
  discord: DiscordConfig;
  /** Discord user ids allowed into the panel. */
  adminIds: Set<string>;
  /** Refuse panel access unless the admin's Discord account has 2FA on. */
  requireAdminMfa: boolean;
  /** Secret URL segment of the panel, e.g. "ops-4k9w2m7q8z1x" -> https://site/ops-4k9w2m7q8z1x */
  adminPath: string;
  tron: TronConfig;
  bot: DiscordBotConfig;
  discordInvite: string;
  supportEmail: string;
  company: string;
  plans: Plan[];
}

/** Paths the Angular app already uses; the panel slug may not collide with them. */
const RESERVED = new Set(['api', 'studies', 'pricing', 'install', 'account', 'dashboard', 'licence', 'faq', 'legal', 'checkout', 'buy', 'admin']);

function env(key: string, def = ''): string {
  const v = process.env[key];
  return v !== undefined && v.trim() !== '' ? v.trim() : def;
}

function envInt(key: string, def: number): number {
  const n = parseInt(env(key), 10);
  return Number.isFinite(n) ? n : def;
}

let cached: AppConfig | null = null;

export function loadConfig(): AppConfig {
  if (cached) return cached;
  const port = envInt('PORT', 8080);
  const publicUrl = env('PUBLIC_URL', `http://localhost:${port}`).replace(/\/$/, '');
  const production = publicUrl.startsWith('https://');
  const origin = new URL(publicUrl).origin;

  // Dev-only overrides so the login flow can be tested against a local mock of Discord.
  const discordWeb = production ? 'https://discord.com' : env('DISCORD_WEB_BASE', 'https://discord.com');
  const discordApi = production ? 'https://discord.com/api/v10' : env('DISCORD_API_BASE', 'https://discord.com/api/v10');
  const tronApi = env('TRON_API_BASE', 'https://api.trongrid.io').replace(/\/$/, '');
  const tronNode = env('TRON_NODE_URL', tronApi).replace(/\/$/, '');
  const tronKey = env('TRONGRID_API_KEY');

  const cfg: AppConfig = {
    port,
    dataDir: env('DATA_DIR', './data'),
    publicUrl,
    origin,
    production,
    appSecret: env('APP_SECRET', production ? '' : 'dev-only-insecure-secret-change-me-0000'),
    discord: {
      clientId: env('DISCORD_CLIENT_ID'),
      clientSecret: env('DISCORD_CLIENT_SECRET'),
      redirectUri: `${publicUrl}/api/auth/discord/callback`,
      authorizeUrl: `${discordWeb}/oauth2/authorize`,
      apiBase: discordApi,
    },
    adminIds: new Set(
      env('ADMIN_DISCORD_IDS')
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
    requireAdminMfa: env('ADMIN_REQUIRE_MFA', 'true') !== 'false',
    adminPath: env('ADMIN_PATH', production ? '' : 'panel-dev-local-only').toLowerCase(),
    tron: {
      address: env('TRON_RECEIVING_ADDRESS'),
      apiBase: tronApi,
      apiKey: tronKey,
      nodeUrl: tronNode,
      // the TronGrid key only goes to TronGrid; another provider gets its own key, if any
      nodeApiKey: env('TRON_NODE_API_KEY', new URL(tronNode).host === new URL(tronApi).host ? tronKey : ''),
      windowMinutes: Math.min(Math.max(envInt('PAYMENT_WINDOW_MINUTES', 30), 10), 240),
    },
    bot: {
      token: env('DISCORD_BOT_TOKEN'),
      guildId: env('DISCORD_GUILD_ID'),
      roleId: env('DISCORD_MEMBER_ROLE_ID'),
    },
    discordInvite: env('DISCORD_INVITE'),
    supportEmail: env('SUPPORT_EMAIL'),
    company: env('COMPANY_NAME', 'FXR Fluxora'),
    plans: defaultPlans(),
  };

  const problems: string[] = [];
  if (!/^[a-z0-9][a-z0-9-]{15,63}$/.test(cfg.adminPath) || RESERVED.has(cfg.adminPath))
    problems.push('ADMIN_PATH (16-64 chars: a-z 0-9 -, not a site page)');
  for (const id of cfg.adminIds) if (!/^\d{17,20}$/.test(id)) problems.push(`ADMIN_DISCORD_IDS (bad id "${id}")`);
  if (cfg.tron.address && !isTronAddress(cfg.tron.address)) problems.push('TRON_RECEIVING_ADDRESS (not a valid TRON address: check every character)');
  if (cfg.tron.address === USDT_CONTRACT) problems.push('TRON_RECEIVING_ADDRESS (that is the USDT contract, not your wallet)');
  for (const [k, u] of [['TRON_API_BASE', cfg.tron.apiBase], ['TRON_NODE_URL', cfg.tron.nodeUrl]] as const) {
    if (production && !u.startsWith('https://')) problems.push(`${k} (https only)`);
  }
  const b = cfg.bot;
  // The ids can be set before the bot token: role sync starts once all three are present.
  if (b.guildId && !/^\d{17,20}$/.test(b.guildId)) problems.push('DISCORD_GUILD_ID (a number)');
  if (b.roleId && !/^\d{17,20}$/.test(b.roleId)) problems.push('DISCORD_MEMBER_ROLE_ID (a number)');
  if (b.token && !(b.guildId && b.roleId)) problems.push('DISCORD_GUILD_ID / DISCORD_MEMBER_ROLE_ID (required with DISCORD_BOT_TOKEN)');
  if (production) {
    if (cfg.appSecret.length < 32) problems.push('APP_SECRET (32+ chars)');
    // Missing Discord keys or owner ids do not stop the site: sign-in (and so the panel) stays closed until they are set.
  }
  if (problems.length) throw new Error('missing/invalid variables: ' + problems.join(', '));

  cached = cfg;
  return cfg;
}

export function defaultPlans(): Plan[] {
  return [
    { id: 'month1', label: 'Monthly', price: 8, days: 30 },
    { id: 'month3', label: '3 months', price: 24, days: 90 },
    { id: 'month6', label: '6 months', price: 48, days: 180 },
    { id: 'year1', label: '1 year', price: 96, days: 365 },
    { id: 'lifetime', label: 'Lifetime', price: 67, days: 0 },
  ];
}

export const CONFIG = Symbol('CONFIG');
