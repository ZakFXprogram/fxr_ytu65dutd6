import { Body, Controller, ForbiddenException, Get, Inject, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsString, Length, Matches } from 'class-validator';
import { CurrentAuth, UserGuard } from '../auth/guards';
import { AuthService, type AuthContext } from '../auth/auth.service';
import { LicencesService } from '../licences/licences.service';
import { OrdersService } from '../orders/orders.service';
import { CodesService } from '../codes/codes.service';
import { RoleSyncService } from '../roles/role-sync.service';
import { DbService, type EventRow } from '../db/db.service';
import { CONFIG, type AppConfig } from '../config';
import { assertId } from '../common/util';

class RedeemDto {
  @IsString() @Length(8, 40) code!: string;
}
class SessionIdDto {
  @IsString() @Matches(/^[0-9a-f]{16}$/) id!: string;
}

/** The signed-in member's own dashboard data, and nothing else. */
@Controller('api/account')
@UseGuards(UserGuard)
export class AccountController {
  constructor(
    private readonly auth: AuthService,
    private readonly licences: LicencesService,
    private readonly orders: OrdersService,
    private readonly codes: CodesService,
    private readonly roles: RoleSyncService,
    private readonly db: DbService,
    @Inject(CONFIG) private readonly cfg: AppConfig,
  ) {}

  @Get()
  get(@CurrentAuth() a: AuthContext) {
    const u = this.db.get<{ role_state: number; in_guild: number | null }>('SELECT role_state, in_guild FROM users WHERE id = ?', a.user.id);
    return {
      licences: this.licences.forUser(a.user.id).map((l) => this.licences.view(l)),
      orders: this.orders.forUser(a.user.id).map((o) => this.orders.view(o)),
      discord: {
        invite: this.db.getMeta('discord_invite') || this.cfg.discordInvite,
        roleSync: this.roles.configured,
        roleGranted: u?.role_state === 1,
        inServer: u?.in_guild === null || u?.in_guild === undefined ? null : u.in_guild === 1,
      },
      activity: this.db
        .all<EventRow>('SELECT * FROM events WHERE user_id = ? ORDER BY id DESC LIMIT 30', a.user.id)
        .map((e) => ({ at: e.ts_ms, kind: e.kind, text: e.text })),
    };
  }

  /** Generates a new licence key and returns it this one time. The old key stops working. */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('licences/:id/key')
  key(@CurrentAuth() a: AuthContext, @Param('id') id: string) {
    const key = this.licences.rotateKey(assertId(id), a.user.id);
    if (!key) throw new NotFoundException();
    return { key };
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('licences/:id/move')
  move(@CurrentAuth() a: AuthContext, @Param('id') id: string) {
    const r = this.licences.moveMachine(assertId(id), a.user.id);
    if (!r.ok && r.nextMoveAt === 0) throw new NotFoundException();
    if (!r.ok) throw new ForbiddenException({ message: 'You can move your licence once every 7 days.', nextMoveAt: r.nextMoveAt });
    return r;
  }

  /** Activates a redeem key on this Discord account. */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('redeem')
  redeem(@CurrentAuth() a: AuthContext, @Body() dto: RedeemDto) {
    return this.codes.redeem(dto.code, a.user.id);
  }

  /** Re-checks the Discord role now (after joining the server, for example). */
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('discord/sync')
  async syncRole(@CurrentAuth() a: AuthContext) {
    return { result: await this.roles.syncUser(a.user.id) };
  }

  @Get('sessions')
  sessions(@CurrentAuth() a: AuthContext) {
    return this.auth.listSessions(a.user.id, a.session);
  }

  @Post('sessions/revoke')
  revokeSession(@CurrentAuth() a: AuthContext, @Body() dto: SessionIdDto) {
    if (!this.auth.revokeSession(a.user.id, dto.id)) throw new NotFoundException();
    this.db.logEvent('security', 'a session was signed out', a.user.id);
    return { ok: true };
  }

  @Post('sessions/revoke-others')
  revokeOthers(@CurrentAuth() a: AuthContext) {
    const n = this.auth.revokeOtherSessions(a.user.id, a.session);
    this.db.logEvent('security', `signed out of ${n} other session(s)`, a.user.id);
    return { ok: true, ended: n };
  }
}
