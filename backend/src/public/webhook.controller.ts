import { Body, Controller, Headers, Inject, Post, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { IsOptional, IsString, Length } from 'class-validator';
import { CONFIG, type AppConfig } from '../config';
import { LicencesService } from '../licences/licences.service';

class PaidDto {
  @IsString() @Length(1, 64) userRef!: string;
  @IsString() @Length(1, 32) plan!: string;
  @IsOptional() @IsString() @Length(0, 128) orderId?: string;
}

/**
 * Called by the external crypto payment provider once an order is confirmed paid. We verify a shared secret
 * (HMAC over the raw JSON) and issue the licence. This server never touches the blockchain or any wallet key.
 */
@Controller('api/webhook')
export class WebhookController {
  constructor(
    @Inject(CONFIG) private readonly cfg: AppConfig,
    private readonly licences: LicencesService,
  ) {}

  @Post('paid')
  paid(@Body() dto: PaidDto, @Headers('x-fxr-signature') sig?: string) {
    if (!this.cfg.webhookSecret) throw new UnauthorizedException('webhook disabled');
    const want = createHmac('sha256', this.cfg.webhookSecret).update(JSON.stringify(dto)).digest('hex');
    if (!sig || !safeEqual(sig, want)) throw new UnauthorizedException('bad signature');
    const { licence, key } = this.licences.issue(dto.userRef.trim(), dto.plan, 'payment', dto.orderId ?? '');
    return { ok: true, licenceId: licence.id, key };
  }
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
