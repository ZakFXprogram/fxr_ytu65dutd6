import { Body, Controller, Get, Inject, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { AdminAuth, AdminGuard } from './admin.guard';
import { LicencesService } from '../licences/licences.service';
import { DbService } from '../db/db.service';
import { CONFIG, type AppConfig } from '../config';

class LoginDto {
  @IsString() @Length(1, 64) user!: string;
  @IsString() @Length(1, 128) password!: string;
}
class CreateDto {
  @IsString() @Length(1, 64) userRef!: string;
  @IsString() @Length(1, 32) plan!: string;
  @IsOptional() @IsInt() @Min(0) @Max(36500) days?: number;
}
class IdDto {
  @IsString() @Length(1, 64) id!: string;
}

@Controller('api/admin')
export class AdminController {
  constructor(
    private readonly auth: AdminAuth,
    private readonly licences: LicencesService,
    private readonly db: DbService,
    @Inject(CONFIG) private readonly cfg: AppConfig,
  ) {}

  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post('login')
  login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const token = this.auth.login(dto.user, dto.password);
    if (!token) throw new UnauthorizedException('wrong credentials');
    this.auth.setCookie(res, token);
    return { ok: true };
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    this.auth.clearCookie(res);
    return { ok: true };
  }

  @Get('me')
  me(@Req() req: Request) {
    return { authenticated: this.auth.valid(this.auth.readCookie(req)) };
  }

  @UseGuards(AdminGuard)
  @Get('state')
  state() {
    const nowMs = Date.now();
    return {
      stats: this.licences.stats(),
      plans: this.cfg.plans,
      licences: this.licences.all().map((l) => ({
        id: l.id,
        userRef: l.user_ref,
        plan: l.plan,
        status: this.licences.effectiveStatus(l),
        lifetime: l.end_ms === 0,
        expiresAt: l.end_ms,
        activated: !!l.machine_id,
        lastSeenAt: l.last_seen_ms,
        source: l.source,
        createdAt: l.created_ms,
        active: LicencesService.isActive(l, nowMs),
      })),
      events: this.db.recentEvents(40),
    };
  }

  @UseGuards(AdminGuard)
  @Post('licences/create')
  create(@Body() dto: CreateDto) {
    const { licence, key } = this.licences.issue(dto.userRef.trim(), dto.plan, 'admin', '', dto.days);
    return { id: licence.id, key };
  }

  @UseGuards(AdminGuard)
  @Post('licences/revoke')
  revoke(@Body() dto: IdDto) {
    return { ok: this.licences.revoke(dto.id) };
  }

  @UseGuards(AdminGuard)
  @Post('licences/reset-machine')
  reset(@Body() dto: IdDto) {
    return { ok: this.licences.resetMachine(dto.id) };
  }
}
