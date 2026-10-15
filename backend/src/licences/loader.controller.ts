import { Body, Controller, Post } from '@nestjs/common';
import { IsString, Length } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { LicencesService } from './licences.service';

class AuthDto {
  @IsString()
  @Length(8, 40)
  key!: string;

  @IsString()
  @Length(1, 128)
  machine!: string;
}

/**
 * The FXR Loader (inside MotiveWave) calls this to check a licence. Access depends only on an active
 * licence, never on a Discord role. The loader binds to the first computer that uses the key.
 */
@Controller('api/loader')
export class LoaderController {
  constructor(private readonly licences: LicencesService) {}

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('auth')
  auth(@Body() dto: AuthDto) {
    const r = this.licences.authenticate(dto.key, dto.machine);
    if (!r.ok) return { ok: false, error: r.reason };
    return { ok: true, plan: r.plan, expiresAt: r.expiresAt };
  }
}
