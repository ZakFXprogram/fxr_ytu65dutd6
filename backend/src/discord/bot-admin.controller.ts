import { Controller, Post, Get, Body, UseGuards, BadRequestException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Inject } from '@nestjs/common';
import { IsString, Matches, IsOptional } from 'class-validator';
import { AdminGuard, CurrentAuth } from '../auth/guards';
import { type AuthContext } from '../auth/auth.service';
import { CONFIG, type AppConfig } from '../config';
import { BotService } from './bot.service';
import { ContentService } from './content.service';
import { RemindersService } from './reminders.service';
import { DbService } from '../db/db.service';
import { commandDefinitions } from './commands';

const SNOWFLAKE = /^\d{17,20}$/;

class PublishPostDto {
  @IsString() postId!: string;
  @IsOptional() @Matches(SNOWFLAKE, { message: 'ID de salon invalide' }) channelId?: string;
}

class PublishJarDto {
  @IsOptional() @Matches(SNOWFLAKE, { message: 'ID de salon invalide' }) channelId?: string;
}

/**
 * Owner-only Discord operations, reached under the secret panel path (/api/<ADMIN_PATH>/bot/...). Each one is
 * an explicit action the owner triggers from the panel — nothing fires on its own.
 */
@Controller('api/admin/bot')
@UseGuards(AdminGuard)
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class BotAdminController {
  constructor(
    private readonly bot: BotService,
    private readonly content: ContentService,
    private readonly reminders: RemindersService,
    private readonly db: DbService,
    @Inject(CONFIG) private readonly cfg: AppConfig,
  ) {}

  /** What is wired up, so the panel can show the owner what still needs setting. */
  @Get('status')
  status() {
    const b = this.cfg.bot;
    return {
      botConfigured: this.bot.configured,
      appId: b.appId ? true : false,
      publicKey: b.publicKey ? true : false,
      memberRole: b.roleId ? true : false,
      affiliateRole: b.affiliateRoleId ? true : false,
      downloadsChannel: b.downloadsChannelId ? true : false,
      interactionsUrl: `${this.cfg.publicUrl}/api/discord/interactions`,
    };
  }

  /** Registers (overwrites) the slash commands on the guild. Safe to run again; one call replaces the set. */
  @Post('register-commands')
  async registerCommands(@CurrentAuth() a: AuthContext) {
    if (!this.bot.configured || !this.cfg.bot.appId) {
      return { ok: false, error: 'DISCORD_BOT_TOKEN / DISCORD_APP_ID manquant' };
    }
    await this.discord(() => this.bot.registerGuildCommands(commandDefinitions()));
    this.db.logEvent('bot', `Slash commands (ré)enregistrées par ${a.user.id}`);
    return { ok: true, count: commandDefinitions().length };
  }

  /** Turns a Discord REST failure into a clear, actionable message for the panel. */
  private async discord<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 401) {
        throw new BadRequestException(
          "Discord a refusé le token (401). Vérifie DISCORD_BOT_TOKEN : le token du bot de l'app FXR (onglet Bot), sans « Bot » ni espace.",
        );
      }
      if (status === 403) {
        throw new BadRequestException(
          'Discord : accès refusé (403). Le bot doit être sur le serveur, son rôle au-dessus des rôles gérés, avec Gérer les rôles / Envoyer des messages.',
        );
      }
      if (status === 404) throw new BadRequestException('Discord : introuvable (404). Vérifie le salon / le serveur.');
      throw new BadRequestException('Discord a renvoyé une erreur : ' + ((e as Error).message || 'inconnue'));
    }
  }

  /** The guides available to publish, with where each one is currently posted. */
  @Get('posts')
  posts() {
    return this.content.availablePosts();
  }

  /** Publishes (or re-edits) one guide in a channel. */
  @Post('publish-post')
  async publishPost(@CurrentAuth() a: AuthContext, @Body() dto: PublishPostDto) {
    if (!this.bot.configured) throw new BadRequestException('Bot non configuré');
    const channelId = dto.channelId || '';
    if (!SNOWFLAKE.test(channelId)) throw new BadRequestException('Donne le salon où publier');
    const r = await this.discord(() => this.content.publishPost(dto.postId, channelId));
    return { ok: true, ...r, by: a.user.id };
  }

  /** Patches the Loader jar with this server's config and publishes it to #téléchargements. */
  @Post('publish-jar')
  async publishJar(@CurrentAuth() a: AuthContext, @Body() dto: PublishJarDto) {
    if (!this.bot.configured) throw new BadRequestException('Bot non configuré');
    const channelId = dto.channelId || this.cfg.bot.downloadsChannelId;
    if (!SNOWFLAKE.test(channelId)) throw new BadRequestException('Aucun salon #téléchargements configuré');
    const r = await this.discord(() => this.content.publishJar(channelId));
    return { ok: true, ...r, by: a.user.id };
  }

  /** Runs the expiry-reminder pass now (also runs on its own schedule when enabled). */
  @Post('run-reminders')
  async runReminders() {
    if (!this.reminders.enabled) return { ok: false, error: 'Rappels désactivés (DISCORD_REMINDER_DAYS=0)' };
    return { ok: true, ...(await this.reminders.run()) };
  }
}
