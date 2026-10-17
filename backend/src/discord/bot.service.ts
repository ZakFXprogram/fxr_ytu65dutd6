import { Inject, Injectable, Logger } from '@nestjs/common';
import { CONFIG, type AppConfig } from '../config';

export interface MessagePayload {
  content?: string;
  embeds?: unknown[];
  allowed_mentions?: { parse: string[] };
}

export interface GuildMember {
  nick?: string | null;
  roles: string[];
  user?: { id: string; username: string; global_name?: string | null };
}

/**
 * Thin Discord REST client used for the bot's outward actions: publishing and editing channel messages,
 * uploading the Loader jar, sending DMs, reading/altering a member's roles, and registering slash commands.
 *
 * It never opens a gateway websocket — interactions arrive over HTTP (see InteractionsController). Every
 * call uses the bot token and backs off on 429. Nothing here runs on its own; callers decide when to act.
 */
@Injectable()
export class BotService {
  private readonly log = new Logger('Bot');
  private pausedUntil = 0;

  constructor(@Inject(CONFIG) private readonly cfg: AppConfig) {}

  get configured(): boolean {
    const b = this.cfg.bot;
    return !!(b.token && b.guildId);
  }

  /** The role id that an active licence of this kind should grant, or '' if that role is not configured. */
  roleForKind(kind: string): string {
    return kind === 'affilie' ? this.cfg.bot.affiliateRoleId : this.cfg.bot.roleId;
  }

  /** Every FXR-managed role id (used to reconcile a member's roles). */
  managedRoles(): string[] {
    return [this.cfg.bot.roleId, this.cfg.bot.affiliateRoleId].filter(Boolean);
  }

  // ---------------------------------------------------------------- messages

  async postMessage(channelId: string, payload: MessagePayload): Promise<string> {
    const r = await this.api('POST', `/channels/${channelId}/messages`, this.msg(payload));
    return r.id as string;
  }

  async editMessage(channelId: string, messageId: string, payload: MessagePayload): Promise<void> {
    await this.api('PATCH', `/channels/${channelId}/messages/${messageId}`, this.msg(payload));
  }

  async deleteMessage(channelId: string, messageId: string): Promise<void> {
    await this.api('DELETE', `/channels/${channelId}/messages/${messageId}`);
  }

  /** Posts a message carrying one file (the Loader jar). Returns the new message id. */
  async postFile(channelId: string, filename: string, bytes: Uint8Array, content?: string): Promise<string> {
    const form = new FormData();
    form.append('payload_json', JSON.stringify(this.msg({ content })));
    form.append('files[0]', new Blob([bytes as unknown as BlobPart]), filename);
    const r = await this.multipart('POST', `/channels/${channelId}/messages`, form);
    return r.id as string;
  }

  // ---------------------------------------------------------------- DMs

  async dm(userId: string, payload: MessagePayload): Promise<boolean> {
    try {
      const ch = await this.api('POST', '/users/@me/channels', { recipient_id: userId });
      await this.api('POST', `/channels/${ch.id}/messages`, this.msg(payload));
      return true;
    } catch (e) {
      // the member may have DMs closed; not an error we retry
      this.log.debug(`dm ${userId} failed: ${(e as Error).message}`);
      return false;
    }
  }

  // ---------------------------------------------------------------- members / roles

  async getMember(userId: string): Promise<GuildMember | null> {
    try {
      return (await this.api('GET', `/guilds/${this.cfg.bot.guildId}/members/${userId}`)) as unknown as GuildMember;
    } catch (e) {
      if ((e as ApiError).status === 404) return null;
      throw e;
    }
  }

  async addRole(userId: string, roleId: string): Promise<number> {
    return this.roleCall('PUT', userId, roleId);
  }

  async removeRole(userId: string, roleId: string): Promise<number> {
    return this.roleCall('DELETE', userId, roleId);
  }

  private async roleCall(method: 'PUT' | 'DELETE', userId: string, roleId: string): Promise<number> {
    try {
      await this.api(method, `/guilds/${this.cfg.bot.guildId}/members/${userId}/roles/${roleId}`, undefined, {
        'X-Audit-Log-Reason': 'FXR licence sync',
      });
      return 204;
    } catch (e) {
      return (e as ApiError).status ?? 0;
    }
  }

  // ---------------------------------------------------------------- slash commands

  /** Registers (overwrites) the guild slash commands. One call replaces the whole set. */
  async registerGuildCommands(commands: unknown[]): Promise<void> {
    const b = this.cfg.bot;
    await this.api('PUT', `/applications/${b.appId}/guilds/${b.guildId}/commands`, commands);
  }

  // ---------------------------------------------------------------- plumbing

  private msg(p: MessagePayload): MessagePayload {
    return { allowed_mentions: { parse: [] }, ...p };
  }

  private async api(method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}): Promise<Record<string, unknown>> {
    await this.waitIfPaused();
    const headers: Record<string, string> = { Authorization: `Bot ${this.cfg.bot.token}`, ...extraHeaders };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const r = await fetch(`${this.cfg.discord.apiBase}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(12_000),
    });
    return this.handle(r, method, path);
  }

  private async multipart(method: string, path: string, form: FormData): Promise<Record<string, unknown>> {
    await this.waitIfPaused();
    const r = await fetch(`${this.cfg.discord.apiBase}${path}`, {
      method,
      headers: { Authorization: `Bot ${this.cfg.bot.token}` },
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
    return this.handle(r, method, path);
  }

  private async handle(r: Response, method: string, path: string): Promise<Record<string, unknown>> {
    if (r.status === 429) {
      const j = (await r.json().catch(() => ({}))) as { retry_after?: number };
      this.pausedUntil = Date.now() + Math.ceil((j.retry_after ?? 5) * 1000);
      throw new ApiError(`rate limited on ${method} ${path}`, 429);
    }
    if (r.status === 204) return {};
    const text = await r.text();
    if (!r.ok) throw new ApiError(`${method} ${path} -> ${r.status} ${text.slice(0, 200)}`, r.status);
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
  }

  private async waitIfPaused(): Promise<void> {
    const wait = this.pausedUntil - Date.now();
    if (wait > 0) await new Promise((ok) => setTimeout(ok, Math.min(wait, 10_000)));
  }
}

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
