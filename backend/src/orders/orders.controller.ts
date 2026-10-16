import { Body, Controller, Get, Headers, HttpCode, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { Equals, IsBoolean, IsString, Length, Matches } from 'class-validator';
import { CurrentAuth, UserGuard } from '../auth/guards';
import type { AuthContext } from '../auth/auth.service';
import { OrdersService } from './orders.service';
import { NowPaymentsClient } from '../payments/nowpayments.client';
import { assertId } from '../common/util';

class CreateOrderDto {
  @IsString() @Length(1, 32) @Matches(/^[a-z0-9]+$/) plan!: string;
  /** The buyer ticked "I accept the Terms and the Risk disclosure (not investment advice)". */
  @IsBoolean() @Equals(true, { message: 'Please accept the Terms and the Risk disclosure to continue.' }) acceptTerms!: boolean;
}

@Controller('api/orders')
@UseGuards(UserGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  /** Opens an order and returns the NOWPayments checkout link. Signing in with Discord is required. */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post()
  async create(@CurrentAuth() a: AuthContext, @Body() dto: CreateOrderDto) {
    return this.orders.view(await this.orders.create(a.user.id, dto.plan));
  }

  @Get(':id')
  get(@CurrentAuth() a: AuthContext, @Param('id') id: string) {
    return this.orders.view(this.orders.mine(assertId(id), a.user.id));
  }

  @Post(':id/cancel')
  cancel(@CurrentAuth() a: AuthContext, @Param('id') id: string) {
    return this.orders.view(this.orders.cancel(assertId(id), a.user.id));
  }
}

/**
 * Payment notifications from NOWPayments. No session, no Origin: authenticated by the HMAC signature, and the
 * payment is then fetched back from NOWPayments before anything is granted.
 */
@Controller('api/payments/nowpayments')
export class NowPaymentsIpnController {
  constructor(
    private readonly orders: OrdersService,
    private readonly np: NowPaymentsClient,
  ) {}

  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Post('ipn')
  @HttpCode(200)
  async ipn(@Req() req: RawBodyRequest<Request>, @Body() body: Record<string, unknown>, @Headers('x-nowpayments-sig') sig?: string) {
    if (!this.np.configured) throw new NotFoundException();
    await this.orders.handleIpn(body, sig, req.rawBody);
    return { ok: true };
  }
}
