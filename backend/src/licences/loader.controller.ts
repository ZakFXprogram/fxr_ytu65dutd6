import { Body, Controller, Get, Post, Query, BadRequestException } from '@nestjs/common';
import { IsString, Length } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { LicencesService } from './licences.service';
import { LoaderSessionService } from '../loader/loader-session.service';

class AuthDto {
  @IsString()
  @Length(8, 40)
  key!: string;

  @IsString()
  @Length(1, 128)
  machine!: string;
}

/**
 * Endpoints the FXR Loader (inside MotiveWave) calls. Access depends only on an active licence.
 *
 * The current Loader signs in through the website (no 127.0.0.1): it opens {@code /loader?req=…}, then polls
 * {@link poll} for the verdict and re-checks with {@link check}. These are unauthenticated on purpose — the
 * `req` is an unguessable nonce and the token is HMAC-signed. The legacy key endpoint stays for older jars.
 */
@Controller('api/loader')
export class LoaderController {
  constructor(
    private readonly licences: LicencesService,
    private readonly sessions: LoaderSessionService,
  ) {}

  /** Loader polls for the result of the browser sign-in. */
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Get('poll')
  poll(@Query('req') req: unknown) {
    if (!LoaderSessionService.validReq(req)) throw new BadRequestException('bad req');
    return this.sessions.poll(req);
  }

  /** Loader re-validates its token against the current licence state. */
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Get('check')
  check(@Query('token') token: unknown) {
    if (typeof token !== 'string' || token.length < 16 || token.length > 512) throw new BadRequestException('bad token');
    return this.sessions.check(token);
  }

  /** Legacy key-based loader (older jars). */
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('auth')
  auth(@Body() dto: AuthDto) {
    const r = this.licences.authenticate(dto.key, dto.machine);
    if (!r.ok) return { ok: false, error: r.reason };
    return { ok: true, plan: r.plan, expiresAt: r.expiresAt };
  }
}
