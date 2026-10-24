import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { CONFIG, type AppConfig } from '../config';
import { DbService } from '../db/db.service';
import { BotService } from './bot.service';
import { postById, postEmbed, jarReleaseText, POSTS } from './posts';
import { readEntry, withEntry } from './jar';

export interface Tracked {
  channelId: string;
  messageId: string;
  at: number;
}

/**
 * Publishes the server's content: the channel guides (install, rules, FAQ, launch) and the Loader jar.
 * A guide is posted once and edited in place on later publishes; the jar is patched with this server's
 * licence config just before upload, so no key config is ever committed. Each action is owner-triggered.
 */
@Injectable()
export class ContentService {
  private readonly log = new Logger('Content');

  constructor(
    private readonly bot: BotService,
    private readonly db: DbService,
    @Inject(CONFIG) private readonly cfg: AppConfig,
  ) {}

  availablePosts() {
    const out: { id: string; title: string; posted: Tracked | null }[] = [];
    for (const p of POSTS) out.push({ id: p.id, title: p.title, posted: this.tracked(`post:${p.id}`) });
    return out;
  }

  /** Posts a guide, or edits the message already posted for it. */
  async publishPost(postId: string, channelId: string): Promise<{ messageId: string; edited: boolean }> {
    const p = postById(postId);
    if (!p) throw new Error('unknown post ' + postId);
    const payload = { embeds: [postEmbed(p)] };
    const prev = this.tracked(`post:${postId}`);
    if (prev && prev.channelId === channelId) {
      try {
        await this.bot.editMessage(channelId, prev.messageId, payload);
        this.track(`post:${postId}`, channelId, prev.messageId);
        return { messageId: prev.messageId, edited: true };
      } catch (e) {
        this.log.warn(`edit ${postId} failed, posting new: ${(e as Error).message}`);
      }
    }
    const id = await this.bot.postMessage(channelId, payload);
    this.track(`post:${postId}`, channelId, id);
    this.db.logEvent('bot', `Message « ${p.title} » publié`);
    return { messageId: id, edited: false };
  }

  /** Patches the Loader jar with this server's config and uploads it, replacing the previous release message. */
  async publishJar(channelId: string): Promise<{ messageId: string; version: string }> {
    const base = this.loaderJar();
    const version = readEntry(base, 'module-version')?.toString('ascii').trim() || '?';
    const patched = withEntry(base, 'fxr-license.properties', Buffer.from(this.licenceProperties(), 'utf8'));

    const prev = this.tracked('jar:release');
    const id = await this.bot.postFile(channelId, 'FXROrderFlow.jar', patched, jarReleaseText(version));
    if (prev) await this.bot.deleteMessage(prev.channelId, prev.messageId).catch(() => {});
    this.track('jar:release', channelId, id);
    this.db.logEvent('bot', `Jar Loader v${version} publié dans #downloads`);
    return { messageId: id, version };
  }

  /** Rewrites the text of the current jar release message (e.g. after the release notes changed language). */
  async refreshJarText(): Promise<boolean> {
    const prev = this.tracked('jar:release');
    if (!prev) return false;
    const version = readEntry(this.loaderJar(), 'module-version')?.toString('ascii').trim() || '?';
    await this.bot.editMessage(prev.channelId, prev.messageId, { content: jarReleaseText(version) });
    return true;
  }

  /** The Loader's licence config (public ids only), built from this server's settings. */
  private licenceProperties(): string {
    const b = this.cfg.bot;
    const roles = [b.roleId, b.affiliateRoleId].filter(Boolean).join(',');
    const users = [...this.cfg.adminIds].join(',');
    return (
      `# FXR Fluxora - acces aux studies (genere par le site)\n` +
      `site_url=${this.cfg.publicUrl}\n` +
      `guild_name=${(this.cfg.company || 'FXR Fluxora').replace(/[\n=:#!]/g, ' ')}\n` +
      // kept for older (Discord-direct) jars; the current Loader signs in through site_url
      `client_id=${b.appId}\n` +
      `guild_id=${b.guildId}\n` +
      `role_ids=${roles}\n` +
      `user_ids=${users}\n` +
      `ports=53134,53135,53136\n`
    );
  }

  private loaderJar(): Buffer {
    const path = process.env.LOADER_JAR_PATH || join(process.cwd(), 'assets', 'FXROrderFlow.jar');
    return readFileSync(path);
  }

  private tracked(key: string): Tracked | null {
    const raw = this.db.getMeta(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Tracked;
    } catch {
      return null;
    }
  }

  private track(key: string, channelId: string, messageId: string): void {
    this.db.setMeta(key, JSON.stringify({ channelId, messageId, at: Date.now() }));
  }
}
