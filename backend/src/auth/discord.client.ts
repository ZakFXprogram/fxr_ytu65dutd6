import { Inject, Injectable, Logger } from '@nestjs/common';
import { CONFIG, type AppConfig } from '../config';

export interface DiscordUser {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
  mfa_enabled?: boolean;
}

/**
 * Minimal Discord OAuth2 client (authorization-code flow, scope "identify" only: no e-mail, no guilds).
 * The access token is used once to read the user's id, then revoked; we never store Discord tokens.
 */
@Injectable()
export class DiscordClient {
  private readonly log = new Logger('Discord');

  constructor(@Inject(CONFIG) private readonly cfg: AppConfig) {}

  get configured(): boolean {
    return !!(this.cfg.discord.clientId && this.cfg.discord.clientSecret);
  }

  authorizeUrl(state: string): string {
    const d = this.cfg.discord;
    const q = new URLSearchParams({
      response_type: 'code',
      client_id: d.clientId,
      scope: 'identify',
      state,
      redirect_uri: d.redirectUri,
      prompt: 'none',
    });
    return `${d.authorizeUrl}?${q.toString()}`;
  }

  async exchange(code: string): Promise<string> {
    const d = this.cfg.discord;
    const r = await fetch(`${d.apiBase}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: d.redirectUri,
        client_id: d.clientId,
        client_secret: d.clientSecret,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error(`token exchange failed (${r.status})`);
    const j = (await r.json()) as { access_token?: unknown };
    if (typeof j.access_token !== 'string' || !j.access_token) throw new Error('no access token');
    return j.access_token;
  }

  async me(accessToken: string): Promise<DiscordUser> {
    const r = await fetch(`${this.cfg.discord.apiBase}/users/@me`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error(`users/@me failed (${r.status})`);
    const u = (await r.json()) as Partial<DiscordUser>;
    if (typeof u.id !== 'string' || !/^\d{17,20}$/.test(u.id)) throw new Error('bad user id');
    if (typeof u.username !== 'string') throw new Error('bad username');
    return {
      id: u.id,
      username: u.username.slice(0, 64),
      global_name: typeof u.global_name === 'string' ? u.global_name.slice(0, 64) : null,
      avatar: typeof u.avatar === 'string' && /^(a_)?[0-9a-f]{32}$/.test(u.avatar) ? u.avatar : null,
      mfa_enabled: u.mfa_enabled === true,
    };
  }

  /** Best effort: we do not need the token any more, so invalidate it at Discord. */
  revoke(accessToken: string): void {
    const d = this.cfg.discord;
    fetch(`${d.apiBase}/oauth2/token/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: accessToken, token_type_hint: 'access_token', client_id: d.clientId, client_secret: d.clientSecret }),
      signal: AbortSignal.timeout(8000),
    }).catch((e: Error) => this.log.warn(`token revoke failed: ${e.message}`));
  }
}
