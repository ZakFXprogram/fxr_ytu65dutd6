import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsOptional, IsString, Length, Matches } from 'class-validator';
import { OrdersService } from '../orders/orders.service';

class CheckDto {
  @IsString() @Length(1, 32) @Matches(/^[a-z0-9]+$/) plan!: string;
  @IsOptional() @IsString() @Length(0, 24) @Matches(/^[A-Za-z0-9-]*$/) code?: string;
}

/** Public: lets the checkout page preview a promo discount before the buyer pays. */
@Controller('api/promo')
export class PromoController {
  constructor(private readonly orders: OrdersService) {}

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('check')
  check(@Body() dto: CheckDto) {
    return this.orders.quote(dto.plan, dto.code);
  }
}
