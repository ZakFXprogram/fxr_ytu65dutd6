import { Controller, Get, Inject, Logger, Post, Query, Req, Res, ServiceUnavailableException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService, publicUser } from './auth.service';
import { DiscordClient } from './discord.client';
import { DbService } from '../db/db.service';
import { CONFIG, type AppConfig } from '../config';
import { RoleSyncService } from '../roles/role-sync.service';

/** Sign in with Discord — the only way to sign in, for members and for the owner. */
@Controller('api/auth')
export class AuthController {
  private readonly log = new Logger('Auth');

  constructor(
    private readonly auth: AuthService,
    private readonly discord: DiscordClient,
    private readonly db: DbService,
    @Inject(CONFIG) private readonly cfg: AppConfig,
    private readonly roles: RoleSyncService,
  ) {}

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('discord')
  start(@Query('next') next: unknown, @Res() res: Response): void {
    if (!this.discord.configured) throw new ServiceUnavailableException('Discord login is not configured');
    const state = this.auth.beginLogin(res, next);
    res.redirect(302, this.discord.authorizeUrl(state));
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('discord/callback')
  async callback(
    @Query('code') code: unknown,
    @Query('state') state: unknown,
    @Query('error') error: unknown,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const next = this.auth.finishLogin(req, res, state);
    if (!next) return res.redirect(302, '/dashboard?login=expired');
    if (error || typeof code !== 'string' || code.length < 8 || code.length > 256) {
      return res.redirect(302, '/dashboard?login=cancelled');
    }

    let du;
    try {
      const token = await this.discord.exchange(code);
      du = await this.discord.me(token);
      this.discord.revoke(token);
    } catch (e) {
      this.log.warn(`login failed: ${(e as Error).message}`);
      return res.redirect(302, '/dashboard?login=failed');
    }

    const user = this.auth.upsertUser(du);
    if (user.banned) return res.redirect(302, '/dashboard?login=blocked');

    const listed = this.auth.isAdminId(user.id);
    const admin = listed && (du.mfa_enabled === true || !this.cfg.requireAdminMfa);
    this.auth.createSession(req, res, user.id, admin);
    this.db.logEvent(
      'login',
      listed ? `owner signed in${admin ? '' : ' WITHOUT panel access (Discord 2FA off)'}` : 'signed in with Discord',
      user.id,
    );
    this.roles.syncSoon(user.id); // picks up the role if the member joined the server since
    res.redirect(302, next);
  }

  @Get('me')
  me(@Req() req: Request) {
    const a = this.auth.resolve(req);
    if (!a) return { authenticated: false };
    return {
      authenticated: true,
      user: publicUser(a.user),
      admin: a.admin,
      // only ever true for the owner's own account: tells the panel why access is refused
      adminMfaRequired: this.auth.isAdminId(a.user.id) && !a.admin,
    };
  }

  @Post('logout')
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.auth.logout(req, res);
    return { ok: true };
  }
}
