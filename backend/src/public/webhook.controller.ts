import { Body, CanActivate, Controller, Headers, Inject, Injectable, NotFoundException, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { createHmac } from 'node:crypto';
import { IsOptional, IsString, Length, Matches } from 'class-validator';
import { CONFIG, type AppConfig } from '../config';
import { LicencesService } from '../licences/licences.service';
import { DISCORD_ID, safeEqual } from '../common/util';

class PaidDto {
  @IsString() @Matches(DISCORD_ID) userRef!: string;
  @IsString() @Length(1, 32) plan!: string;
  @IsOptional() @IsString() @Length(0, 128) orderId?: string;
}

/** With no WEBHOOK_SECRET the route answers 404 before any parsing or validation. */
@Injectable()
export class WebhookEnabledGuard implements CanActivate {
  constructor(@Inject(CONFIG) private readonly cfg: AppConfig) {}
  canActivate(): boolean {
    if (!this.cfg.webhookSecret) throw new NotFoundException();
    return true;
  }
}

/**
 * OPTIONAL. Only for the day you plug an external payment provider in. With WEBHOOK_SECRET empty (the default)
 * this endpoint does not exist (404). The signature is an HMAC-SHA256 of the exact raw request body.
 */
@Controller('api/webhook')
@UseGuards(WebhookEnabledGuard)
export class WebhookController {
  constructor(
    @Inject(CONFIG) private readonly cfg: AppConfig,
    private readonly licences: LicencesService,
  ) {}

  @Post('paid')
  paid(@Req() req: RawBodyRequest<Request>, @Body() dto: PaidDto, @Headers('x-fxr-signature') sig?: string) {
    const raw = req.rawBody;
    if (!raw || typeof sig !== 'string') throw new UnauthorizedException();
    const want = createHmac('sha256', this.cfg.webhookSecret).update(raw).digest('hex');
    if (!safeEqual(sig.toLowerCase(), want)) throw new UnauthorizedException();
    if (!this.licences.plan(dto.plan)) throw new NotFoundException('Unknown plan');
    const l = this.licences.grant(dto.userRef, dto.plan, 'webhook', dto.orderId ?? '');
    return { ok: true, licenceId: l.id };
  }
}
