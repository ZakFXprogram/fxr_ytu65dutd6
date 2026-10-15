import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsString, Length, Matches } from 'class-validator';
import { CurrentAuth, UserGuard } from '../auth/guards';
import type { AuthContext } from '../auth/auth.service';
import { OrdersService } from './orders.service';
import { assertId } from '../common/util';

class CreateOrderDto {
  @IsString() @Length(1, 32) @Matches(/^[a-z0-9]+$/) plan!: string;
}
class TxidDto {
  @IsString() @Length(64, 80) txid!: string;
}

@Controller('api/orders')
@UseGuards(UserGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post()
  create(@CurrentAuth() a: AuthContext, @Body() dto: CreateOrderDto) {
    return this.orders.view(this.orders.create(a.user.id, dto.plan));
  }

  @Get(':id')
  get(@CurrentAuth() a: AuthContext, @Param('id') id: string) {
    return this.orders.view(this.orders.mine(assertId(id), a.user.id));
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(':id/txid')
  txid(@CurrentAuth() a: AuthContext, @Param('id') id: string, @Body() dto: TxidDto) {
    return this.orders.view(this.orders.submitTxid(assertId(id), a.user.id, dto.txid));
  }

  @Post(':id/cancel')
  cancel(@CurrentAuth() a: AuthContext, @Param('id') id: string) {
    return this.orders.view(this.orders.cancel(assertId(id), a.user.id));
  }
}
