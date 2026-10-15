/**
 * Server configuration, read once from the environment (Railway variables). Nothing secret is committed.
 *
 * SECURITY: this service never holds a wallet private key or seed. It only knows the PUBLIC receiving address
 * shown to customers. Nothing in this code can move funds.
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
  /** Public TRON address customers pay to (USDT TRC20). Public information only. */
  payAddress: string;
  /** Hours a customer has to pay and submit the transaction id before an order expires. */
  orderTtlHours: number;
  /** Optional: shared secret for an external payment provider webhook. Empty = endpoint disabled (404). */
  webhookSecret: string;
  discordInvite: string;
  supportEmail: string;
  company: string;
  plans: Plan[];
}

/** Official Tether USD (USDT) TRC20 contract, shown in the panel so a fake "USDT" token is spotted. */
export const USDT_TRC20_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

/** Paths the Angular app already uses; the panel slug may not collide with them. */
const RESERVED = new Set(['api', 'studies', 'pricing', 'install', 'account', 'licence', 'faq', 'legal', 'checkout', 'buy', 'admin']);

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
    payAddress: env('PAY_ADDRESS'),
    orderTtlHours: Math.min(Math.max(envInt('ORDER_TTL_HOURS', 24), 1), 168),
    webhookSecret: env('WEBHOOK_SECRET'),
    discordInvite: env('DISCORD_INVITE'),
    supportEmail: env('SUPPORT_EMAIL'),
    company: env('COMPANY_NAME', 'FXR Fluxora'),
    plans: defaultPlans(),
  };

  const problems: string[] = [];
  if (!/^[a-z0-9][a-z0-9-]{15,63}$/.test(cfg.adminPath) || RESERVED.has(cfg.adminPath))
    problems.push('ADMIN_PATH (16-64 chars: a-z 0-9 -, not a site page)');
  for (const id of cfg.adminIds) if (!/^\d{17,20}$/.test(id)) problems.push(`ADMIN_DISCORD_IDS (bad id "${id}")`);
  if (cfg.payAddress && !/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(cfg.payAddress)) problems.push('PAY_ADDRESS (not a TRON address)');
  if (cfg.webhookSecret && cfg.webhookSecret.length < 24) problems.push('WEBHOOK_SECRET (24+ chars, or leave empty)');
  if (production) {
    if (cfg.appSecret.length < 32) problems.push('APP_SECRET (32+ chars)');
    if (!cfg.discord.clientId || !cfg.discord.clientSecret) problems.push('DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET');
    if (cfg.adminIds.size === 0) problems.push('ADMIN_DISCORD_IDS');
    if (!cfg.payAddress) problems.push('PAY_ADDRESS');
  }
  if (problems.length) throw new Error('missing/invalid variables: ' + problems.join(', '));

  cached = cfg;
  return cfg;
}

export function defaultPlans(): Plan[] {
  return [
    { id: 'month1', label: '1 month', price: 8, days: 30 },
    { id: 'month3', label: '3 months', price: 24, days: 90 },
    { id: 'month6', label: '6 months', price: 48, days: 180 },
    { id: 'year1', label: '1 year', price: 96, days: 365 },
    { id: 'lifetime', label: 'Lifetime', price: 67, days: 0 },
  ];
}

export const CONFIG = Symbol('CONFIG');
