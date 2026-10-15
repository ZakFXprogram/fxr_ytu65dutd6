import { Body, Controller, Get, Header, NotFoundException, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';
import type { Response } from 'express';
import { AdminGuard, CurrentAuth } from '../auth/guards';
import { AuthService, type AuthContext } from '../auth/auth.service';
import { LicencesService } from '../licences/licences.service';
import { OrdersService } from '../orders/orders.service';
import { CodesService } from '../codes/codes.service';
import { RoleSyncService } from '../roles/role-sync.service';
import { AdminService } from './admin.service';
import { DbService } from '../db/db.service';
import { DISCORD_ID } from '../common/util';

const ID = /^[0-9a-f]{24}$/;

class ListDto {
  @IsOptional() @IsString() @Length(0, 100) q?: string;
  @IsOptional() @IsString() @Matches(/^[a-z_]{0,20}$/) status?: string;
  @IsOptional() @IsString() @Matches(/^[a-z0-9]{0,32}$/) plan?: string;
  @IsOptional() @IsString() @Matches(/^[a-z]{0,20}$/) filter?: string;
  @IsOptional() @IsString() @Matches(/^[a-z]{0,20}$/) kind?: string;
  @IsOptional() @IsString() @Length(0, 40) batch?: string;
  @IsOptional() @IsString() @Matches(/^[a-z]{0,20}$/) sort?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(5) @Max(100) size?: number;
}
class OverviewDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(-840) @Max(840) tz?: number;
}
class IdDto {
  @IsString() @Matches(ID) id!: string;
}
class IdsDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @Matches(ID, { each: true }) ids!: string[];
}
class NoteDto extends IdDto {
  @IsOptional() @IsString() @Length(0, 200) note?: string;
}
class ExtendDto extends IdsDto {
  @IsInt() @Min(1) @Max(3650) days!: number;
}
class GrantDto {
  @IsString() @Matches(DISCORD_ID, { message: 'Enter a Discord user id (17-20 digits).' }) userId!: string;
  @IsString() @Length(1, 32) plan!: string;
  @IsOptional() @IsInt() @Min(1) @Max(3650) days?: number;
}
class MemberIdsDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @Matches(DISCORD_ID, { each: true }) ids!: string[];
}
class MemberIdDto {
  @IsString() @Matches(DISCORD_ID) id!: string;
}
class GenerateDto {
  @IsString() @Length(1, 32) plan!: string;
  @IsInt() @Min(1) @Max(200) count!: number;
  @IsOptional() @IsString() @Matches(/^[\w .-]{0,40}$/) batch?: string;
  @IsOptional() @IsInt() @Min(1) @Max(3650) days?: number;
}

/**
 * The owner's panel API. Mounted internally at /api/admin, but that prefix is refused from outside: the browser
 * reaches it only through /api/<ADMIN_PATH>/..., and every route answers 404 unless the caller holds an owner
 * session (allow-listed Discord id, signed in with Discord 2FA on).
 */
@Controller('api/admin')
@UseGuards(AdminGuard)
@Throttle({ default: { limit: 120, ttl: 60_000 } })
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly auth: AuthService,
    private readonly licences: LicencesService,
    private readonly orders: OrdersService,
    private readonly codes: CodesService,
    private readonly roles: RoleSyncService,
    private readonly db: DbService,
  ) {}

  @Get('overview')
  overview(@Query() q: OverviewDto) {
    return this.admin.overview(q.tz ?? 0);
  }

  // ----- orders
  @Get('orders')
  listOrders(@Query() q: ListDto) {
    return this.admin.listOrders(q);
  }

  @Get('orders.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  ordersCsv(@Query() q: ListDto, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Content-Disposition', `attachment; filename="fxr-orders-${new Date().toISOString().slice(0, 10)}.csv"`);
    return this.admin.ordersCsv(q);
  }

  @Post('orders/recheck')
  recheck(@CurrentAuth() a: AuthContext, @Body() dto: IdDto) {
    return this.orders.recheck(dto.id, a.user.id).then((o) => ({ status: o.status }));
  }

  @Post('orders/mark-paid')
  markPaid(@CurrentAuth() a: AuthContext, @Body() dto: NoteDto) {
    return { status: this.orders.markPaidByOwner(dto.id, a.user.id, dto.note ?? '').status };
  }

  @Post('orders/cancel')
  cancelOrders(@CurrentAuth() a: AuthContext, @Body() dto: IdsDto) {
    return { done: dto.ids.filter((id) => this.orders.cancelByOwner(id, a.user.id)).length };
  }

  // ----- subscriptions
  @Get('licences')
  listLicences(@Query() q: ListDto) {
    return this.admin.listLicences(q);
  }

  @Post('licences/grant')
  grant(@CurrentAuth() a: AuthContext, @Body() dto: GrantDto) {
    if (!this.licences.plan(dto.plan)) throw new NotFoundException('Unknown plan');
    const l = this.licences.grant(dto.userId, dto.plan, `panel:${a.user.id}`, '', dto.days);
    this.roles.syncSoon(dto.userId);
    return { id: l.id };
  }

  @Post('licences/extend')
  extend(@CurrentAuth() a: AuthContext, @Body() dto: ExtendDto) {
    let done = 0;
    for (const id of dto.ids) {
      const owner = this.licences.extend(id, dto.days, a.user.id);
      if (owner) { done++; this.roles.syncSoon(owner); }
    }
    return { done };
  }

  @Post('licences/revoke')
  revoke(@CurrentAuth() a: AuthContext, @Body() dto: IdsDto) {
    let done = 0;
    for (const id of dto.ids) {
      const owner = this.licences.revoke(id, a.user.id);
      if (owner) { done++; this.roles.syncSoon(owner); }
    }
    return { done };
  }

  @Post('licences/reset-machine')
  reset(@CurrentAuth() a: AuthContext, @Body() dto: IdDto) {
    return { ok: this.licences.resetMachine(dto.id, a.user.id) };
  }

  // ----- members
  @Get('members')
  listMembers(@Query() q: ListDto) {
    return this.admin.listMembers(q);
  }

  @Get('members/:id')
  member(@Param('id') id: string) {
    if (!DISCORD_ID.test(id)) throw new NotFoundException();
    const m = this.admin.member(id);
    if (!m) throw new NotFoundException();
    return m;
  }

  @Post('members/ban')
  ban(@CurrentAuth() a: AuthContext, @Body() dto: MemberIdsDto) {
    const ids = dto.ids.filter((id) => !this.auth.isAdminId(id));
    const done = ids.filter((id) => this.auth.setBanned(id, true)).length;
    if (done) this.db.logEvent('ban', `${done} member(s) banned by ${a.user.id}`);
    return { done };
  }

  @Post('members/unban')
  unban(@CurrentAuth() a: AuthContext, @Body() dto: MemberIdsDto) {
    const done = dto.ids.filter((id) => this.auth.setBanned(id, false)).length;
    if (done) this.db.logEvent('ban', `${done} member(s) unbanned by ${a.user.id}`);
    return { done };
  }

  @Post('members/logout')
  logoutMember(@Body() dto: MemberIdDto) {
    return { ended: this.auth.revokeUserSessions(dto.id) };
  }

  @Post('members/sync-role')
  async syncRole(@Body() dto: MemberIdDto) {
    return { result: await this.roles.syncUser(dto.id) };
  }

  // ----- redeem keys
  @Get('codes')
  listCodes(@Query() q: ListDto) {
    return this.admin.listCodes(q);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('codes/generate')
  generate(@CurrentAuth() a: AuthContext, @Body() dto: GenerateDto) {
    return { codes: this.codes.generate(dto.plan, dto.count, (dto.batch ?? '').trim(), a.user.id, dto.days) };
  }

  @Post('codes/disable')
  disable(@CurrentAuth() a: AuthContext, @Body() dto: IdsDto) {
    return { done: this.codes.disable(dto.ids, a.user.id) };
  }

  // ----- activity
  @Get('events')
  events(@Query() q: ListDto) {
    return this.admin.listEvents(q);
  }
}
