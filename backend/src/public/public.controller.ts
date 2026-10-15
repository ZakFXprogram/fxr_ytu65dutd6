import { Body, Controller, Get, Inject, Post } from '@nestjs/common';
import { IsString, Length } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { CONFIG, type AppConfig } from '../config';
import { LicencesService } from '../licences/licences.service';

class LicenceLookupDto {
  @IsString()
  @Length(8, 40)
  key!: string;
}

/** Everything the public website needs: site info, plans, and a licence status lookup. */
@Controller('api')
export class PublicController {
  constructor(
    @Inject(CONFIG) private readonly cfg: AppConfig,
    private readonly licences: LicencesService,
  ) {}

  @Get('site')
  site() {
    return {
      name: 'FXR OrderFlow',
      company: this.cfg.company,
      discord: this.cfg.discordInvite,
      support: this.cfg.supportEmail,
      plans: this.cfg.plans.map((p) => ({
        id: p.id,
        label: p.label,
        price: p.price,
        days: p.days,
        lifetime: p.days === 0,
        perMonth: p.days >= 60 ? Math.round(p.price / Math.round(p.days / 30)) : null,
        checkoutUrl: p.checkoutUrl,
      })),
    };
  }

  @Get('health')
  health() {
    return { ok: true };
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('licence/status')
  licenceStatus(@Body() dto: LicenceLookupDto) {
    return this.licences.publicStatus(dto.key);
  }
}
