import { Controller, ForbiddenException, Get, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentAuth, UserGuard } from '../auth/guards';
import type { AuthContext } from '../auth/auth.service';
import { LicencesService } from '../licences/licences.service';
import { OrdersService } from '../orders/orders.service';
import { assertId } from '../common/util';

/** The signed-in member's own data, and nothing else. */
@Controller('api/account')
@UseGuards(UserGuard)
export class AccountController {
  constructor(
    private readonly licences: LicencesService,
    private readonly orders: OrdersService,
  ) {}

  @Get()
  get(@CurrentAuth() a: AuthContext) {
    return {
      licences: this.licences.forUser(a.user.id).map((l) => this.licences.view(l)),
      orders: this.orders.forUser(a.user.id).map((o) => this.orders.view(o)),
    };
  }

  /** Generates a new key and returns it this one time. The old key stops working. */
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
}
