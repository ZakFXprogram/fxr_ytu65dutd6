import { Body, Controller, Get, Inject, NotFoundException, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsInt, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';
import { AdminGuard, CurrentAuth } from '../auth/guards';
import { AuthService, type AuthContext, type UserRow } from '../auth/auth.service';
import { LicencesService } from '../licences/licences.service';
import { OrdersService, ORDER_SUBMITTED } from '../orders/orders.service';
import { DbService } from '../db/db.service';
import { CONFIG, USDT_TRC20_CONTRACT, type AppConfig } from '../config';
import { DISCORD_ID } from '../common/util';

class CreateDto {
  @IsString() @Matches(DISCORD_ID, { message: 'userRef must be a Discord user id' }) userRef!: string;
  @IsString() @Length(1, 32) plan!: string;
  @IsOptional() @IsInt() @Min(0) @Max(36500) days?: number;
}
class IdDto {
  @IsString() @Matches(/^[0-9a-f]{24}$/) id!: string;
}
class RejectDto extends IdDto {
  @IsOptional() @IsString() @Length(0, 200) note?: string;
}
class UserIdDto {
  @IsString() @Matches(DISCORD_ID) id!: string;
}

/**
 * The owner's panel API. Mounted internally at /api/admin, but that prefix is refused from outside: the browser
 * reaches it only through /api/<ADMIN_PATH>/..., and every route answers 404 unless the caller holds an admin
 * session (allow-listed Discord id, signed in with Discord 2FA on).
 */
@Controller('api/admin')
@UseGuards(AdminGuard)
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class AdminController {
  constructor(
    private readonly auth: AuthService,
    private readonly licences: LicencesService,
    private readonly orders: OrdersService,
    private readonly db: DbService,
    @Inject(CONFIG) private readonly cfg: AppConfig,
  ) {}

  @Get('state')
  state() {
    const users = this.db.all<UserRow & { licences: number }>(
      `SELECT u.*, (SELECT COUNT(*) FROM licences l WHERE l.user_ref = u.id) AS licences
       FROM users u ORDER BY u.last_login_ms DESC LIMIT 300`,
    );
    const names = new Map(users.map((u) => [u.id, u.display_name || u.username]));
    const nameOf = (id: string) => names.get(id) ?? this.auth.user(id)?.username ?? null;
    const orders = this.orders.forAdmin();
    return {
      payAddress: this.cfg.payAddress,
      usdtContract: USDT_TRC20_CONTRACT,
      stats: {
        ...this.licences.stats(),
        toCheck: orders.filter((o) => o.status === ORDER_SUBMITTED).length,
        members: this.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM users')!.n,
      },
      plans: this.cfg.plans.map((p) => ({ id: p.id, label: p.label, days: p.days, price: p.price })),
      orders: orders.map((o) => ({ ...this.orders.view(o), userId: o.user_id, userName: nameOf(o.user_id) })),
      licences: this.licences.all().map((l) => ({
        id: l.id,
        userRef: l.user_ref,
        userName: nameOf(l.user_ref),
        plan: l.plan,
        status: this.licences.effectiveStatus(l),
        lifetime: l.end_ms === 0,
        expiresAt: l.end_ms,
        activated: !!l.machine_id,
        keySet: !!l.key_set_ms,
        lastSeenAt: l.last_seen_ms,
        source: l.source,
        createdAt: l.created_ms,
      })),
      members: users.map((u) => ({
        id: u.id,
        name: u.display_name || u.username,
        username: u.username,
        banned: !!u.banned,
        licences: u.licences,
        lastLoginAt: u.last_login_ms,
        owner: this.auth.isAdminId(u.id),
      })),
      events: this.db.recentEvents(60),
    };
  }

  @Post('orders/confirm')
  confirm(@CurrentAuth() a: AuthContext, @Body() dto: IdDto) {
    return this.orders.view(this.orders.confirm(dto.id, a.user.id));
  }

  @Post('orders/reject')
  reject(@CurrentAuth() a: AuthContext, @Body() dto: RejectDto) {
    return this.orders.view(this.orders.reject(dto.id, a.user.id, dto.note ?? ''));
  }

  @Post('licences/create')
  create(@CurrentAuth() a: AuthContext, @Body() dto: CreateDto) {
    if (!this.licences.plan(dto.plan)) throw new NotFoundException('Unknown plan');
    const l = this.licences.grant(dto.userRef, dto.plan, `panel:${a.user.id}`, '', dto.days);
    return { id: l.id };
  }

  @Post('licences/revoke')
  revoke(@CurrentAuth() a: AuthContext, @Body() dto: IdDto) {
    return { ok: this.licences.revoke(dto.id, a.user.id) };
  }

  @Post('licences/reset-machine')
  reset(@CurrentAuth() a: AuthContext, @Body() dto: IdDto) {
    return { ok: this.licences.resetMachine(dto.id, a.user.id) };
  }

  /** Blocks sign-in and ends every session of a member right away. */
  @Post('members/ban')
  ban(@CurrentAuth() a: AuthContext, @Body() dto: UserIdDto) {
    if (this.auth.isAdminId(dto.id)) throw new NotFoundException();
    const ok = this.auth.setBanned(dto.id, true);
    if (ok) this.db.logEvent('ban', `member ${dto.id} banned by ${a.user.id}`);
    return { ok };
  }

  @Post('members/unban')
  unban(@CurrentAuth() a: AuthContext, @Body() dto: UserIdDto) {
    const ok = this.auth.setBanned(dto.id, false);
    if (ok) this.db.logEvent('ban', `member ${dto.id} unbanned by ${a.user.id}`);
    return { ok };
  }

  /** Signs out every session of a member (e.g. a lost or stolen device). */
  @Post('members/logout')
  logoutMember(@CurrentAuth() a: AuthContext, @Body() dto: UserIdDto) {
    const n = this.auth.revokeUserSessions(dto.id);
    this.db.logEvent('sessions', `${n} session(s) of ${dto.id} ended by ${a.user.id}`);
    return { ok: true, ended: n };
  }
}
