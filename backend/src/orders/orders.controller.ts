import { Body, Controller, Get, Header, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Equals, IsBoolean, IsOptional, IsString, Length, Matches } from 'class-validator';
import { toString as qrSvg } from 'qrcode';
import { CurrentAuth, UserGuard } from '../auth/guards';
import type { AuthContext } from '../auth/auth.service';
import { OrdersService } from './orders.service';
import { TronClient } from '../payments/tron.client';
import { assertId } from '../common/util';

class CreateOrderDto {
  @IsString() @Length(1, 32) @Matches(/^[a-z0-9]+$/) plan!: string;
  /** The buyer ticked "I accept the Terms and the Risk disclosure (not investment advice)". */
  @IsBoolean() @Equals(true, { message: 'Please accept the Terms and the Risk disclosure to continue.' }) acceptTerms!: boolean;
  /** Optional promo / affiliate code. */
  @IsOptional() @IsString() @Length(0, 24) @Matches(/^[A-Za-z0-9-]*$/, { message: 'A promo code uses only letters, digits and dashes.' }) promo?: string;
}

class ClaimDto {
  @IsString() @Length(64, 66) @Matches(/^(0x)?[0-9a-fA-F]{64}$/, { message: 'A transaction id (hash) is 64 characters: 0-9 and a-f.' }) txid!: string;
}

@Controller('api/orders')
@UseGuards(UserGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  /** Opens an order with its unique amount to pay. Signing in with Discord is required. */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post()
  create(@CurrentAuth() a: AuthContext, @Body() dto: CreateOrderDto) {
    return this.orders.view(this.orders.create(a.user.id, dto.plan, dto.promo));
  }

  @Get(':id')
  get(@CurrentAuth() a: AuthContext, @Param('id') id: string) {
    return this.orders.view(this.orders.mine(assertId(id), a.user.id));
  }

  @Post(':id/cancel')
  cancel(@CurrentAuth() a: AuthContext, @Param('id') id: string) {
    return this.orders.view(this.orders.cancel(assertId(id), a.user.id));
  }

  /** "I paid from an exchange": the buyer gives the transaction id; it is verified on the blockchain. */
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  @Post(':id/txid')
  async claim(@CurrentAuth() a: AuthContext, @Param('id') id: string, @Body() dto: ClaimDto) {
    return this.orders.view(await this.orders.claim(assertId(id), a.user.id, dto.txid));
  }
}

/** The receiving address as a QR code (public: it is the same for everyone and holds nothing secret). */
@Controller('api/payments')
export class PaymentsController {
  private cache: { addr: string; svg: string } | null = null;

  constructor(private readonly tron: TronClient) {}

  @Get('qr.svg')
  @Header('Content-Type', 'image/svg+xml')
  async qr(): Promise<string> {
    if (!this.tron.configured) throw new NotFoundException();
    const addr = this.tron.address;
    if (this.cache?.addr !== addr) {
      const svg = await qrSvg(addr, { type: 'svg', errorCorrectionLevel: 'M', margin: 1, color: { dark: '#0b0b12', light: '#ffffff' } });
      this.cache = { addr, svg };
    }
    return this.cache.svg;
  }
}
