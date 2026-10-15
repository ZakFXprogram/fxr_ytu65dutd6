import { Controller, Get, Inject } from '@nestjs/common';
import { CONFIG, type AppConfig } from '../config';

/** Everything the public website needs before sign-in. */
@Controller('api')
export class PublicController {
  constructor(@Inject(CONFIG) private readonly cfg: AppConfig) {}

  @Get('site')
  site() {
    return {
      name: 'FXR OrderFlow',
      company: this.cfg.company,
      discord: this.cfg.discordInvite,
      support: this.cfg.supportEmail,
      paymentsOpen: !!this.cfg.payAddress,
      plans: this.cfg.plans.map((p) => ({
        id: p.id,
        label: p.label,
        price: p.price,
        days: p.days,
        lifetime: p.days === 0,
        perMonth: p.days >= 60 ? Math.round(p.price / Math.round(p.days / 30)) : null,
      })),
    };
  }

  @Get('health')
  health() {
    return { ok: true };
  }
}
