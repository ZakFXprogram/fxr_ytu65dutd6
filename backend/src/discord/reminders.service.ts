import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { CONFIG, type AppConfig } from '../config';
import { DbService } from '../db/db.service';
import { BotService } from './bot.service';
import { LIC_ACTIVE, type LicenceRow } from '../licences/licences.service';

/**
 * Sends members a private reminder a few days before their licence ends. Idempotent: each licence end date is
 * reminded once (re-arms if the licence is extended, since its end date changes). Off unless DISCORD_REMINDER_DAYS
 * is set. Runs a few hours apart; a DM the member has blocked is counted as sent so it is not retried forever.
 */
@Injectable()
export class RemindersService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Reminders');
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly db: DbService,
    private readonly bot: BotService,
    @Inject(CONFIG) private readonly cfg: AppConfig,
  ) {}

  get enabled(): boolean {
    return this.bot.configured && this.cfg.bot.reminderDays > 0;
  }

  onModuleInit(): void {
    if (!this.enabled) return;
    this.timer = setInterval(() => void this.run(), 6 * 3_600_000);
    this.timer.unref();
    setTimeout(() => void this.run(), 60_000).unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** DMs every member whose active licence ends within the window and hasn't been reminded for that date. */
  async run(): Promise<{ sent: number; failed: number }> {
    if (!this.enabled) return { sent: 0, failed: 0 };
    const now = Date.now();
    const horizon = now + this.cfg.bot.reminderDays * 86400_000;
    const due = this.db.all<LicenceRow>(
      `SELECT * FROM licences WHERE status = ? AND end_ms > ? AND end_ms <= ? AND (reminded_ms IS NULL OR reminded_ms <> end_ms) LIMIT 100`,
      LIC_ACTIVE, now, horizon,
    );
    let sent = 0;
    let failed = 0;
    for (const l of due) {
      const ok = await this.bot.dm(l.user_ref, {
        content:
          `⏰ **Your FXR Fluxora license expires soon.**\n` +
          `It ends on <t:${Math.floor(l.end_ms / 1000)}:D> (<t:${Math.floor(l.end_ms / 1000)}:R>).\n` +
          `Renew on the website to keep access to the studies. Already renewed? Just ignore this message. 🙂`,
      });
      this.db.run('UPDATE licences SET reminded_ms = ? WHERE id = ?', l.end_ms, l.id);
      if (ok) sent++;
      else failed++;
      await new Promise((r) => setTimeout(r, 300));
    }
    if (sent || failed) this.db.logEvent('bot', `Rappels d'expiration : ${sent} envoyé(s), ${failed} en échec`);
    return { sent, failed };
  }
}
