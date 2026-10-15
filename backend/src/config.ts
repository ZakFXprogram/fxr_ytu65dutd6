/**
 * Server configuration, read once from the environment (Railway variables). Nothing secret is committed.
 *
 * SECURITY: this service never holds a wallet private key or seed. Payments are confirmed by an external
 * crypto payment provider, which calls the paid webhook; we only issue licences.
 */
export interface Plan {
  id: string;
  label: string;
  price: number; // USDT, whole units for display
  days: number; // 0 = lifetime
  checkoutUrl: string; // link to the external payment provider for this plan ('' until configured)
}

export interface AppConfig {
  port: number;
  dataDir: string;
  publicUrl: string;
  production: boolean;
  adminUser: string;
  adminPassword: string;
  webhookSecret: string;
  discordInvite: string;
  supportEmail: string;
  company: string;
  plans: Plan[];
}

function env(key: string, def = ''): string {
  const v = process.env[key];
  return v !== undefined && v.trim() !== '' ? v.trim() : def;
}

function envInt(key: string, def: number): number {
  const n = parseInt(env(key), 10);
  return Number.isFinite(n) ? n : def;
}

export function loadConfig(): AppConfig {
  const publicUrl = env('PUBLIC_URL').replace(/\/$/, '');
  const production = publicUrl.startsWith('https://');
  const cfg: AppConfig = {
    port: envInt('PORT', 8080),
    dataDir: env('DATA_DIR', './data'),
    publicUrl,
    production,
    adminUser: env('ADMIN_USER', 'admin'),
    adminPassword: env('ADMIN_PASSWORD'),
    webhookSecret: env('WEBHOOK_SECRET'),
    discordInvite: env('DISCORD_INVITE'),
    supportEmail: env('SUPPORT_EMAIL'),
    company: env('COMPANY_NAME', 'FXR Fluxora'),
    plans: defaultPlans(),
  };
  if (production) {
    const missing: string[] = [];
    if (cfg.adminPassword.length < 10) missing.push('ADMIN_PASSWORD (10+ chars)');
    if (cfg.webhookSecret.length < 16) missing.push('WEBHOOK_SECRET (16+ chars)');
    if (missing.length) throw new Error('missing/weak production variables: ' + missing.join(', '));
  }
  return cfg;
}

export function defaultPlans(): Plan[] {
  const url = (id: string) => env('CHECKOUT_' + id.toUpperCase(), '');
  return [
    { id: 'month1', label: '1 month', price: 8, days: 30, checkoutUrl: url('month1') },
    { id: 'month3', label: '3 months', price: 24, days: 90, checkoutUrl: url('month3') },
    { id: 'month6', label: '6 months', price: 48, days: 180, checkoutUrl: url('month6') },
    { id: 'year1', label: '1 year', price: 96, days: 365, checkoutUrl: url('year1') },
    { id: 'lifetime', label: 'Lifetime', price: 67, days: 0, checkoutUrl: url('lifetime') },
  ];
}

export const CONFIG = Symbol('CONFIG');
