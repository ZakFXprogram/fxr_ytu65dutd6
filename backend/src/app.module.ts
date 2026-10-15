import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { CONFIG, loadConfig } from './config';
import { frontendDir } from './web';
import { DbService } from './db/db.service';
import { LicencesService } from './licences/licences.service';
import { OrdersService } from './orders/orders.service';
import { AuthService } from './auth/auth.service';
import { DiscordClient } from './auth/discord.client';
import { AdminGuard, UserGuard } from './auth/guards';
import { PublicController } from './public/public.controller';
import { LoaderController } from './licences/loader.controller';
import { AuthController } from './auth/auth.controller';
import { AccountController } from './account/account.controller';
import { NowPaymentsIpnController, OrdersController } from './orders/orders.controller';
import { NowPaymentsClient } from './payments/nowpayments.client';
import { RoleSyncService } from './roles/role-sync.service';
import { CodesService } from './codes/codes.service';
import { AdminService } from './admin/admin.service';
import { AdminController } from './admin/admin.controller';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    ServeStaticModule.forRoot({
      rootPath: frontendDir(),
      exclude: ['/api/{*rest}'],
      serveStaticOptions: { fallthrough: true, index: false },
    }),
  ],
  controllers: [
    PublicController,
    AuthController,
    AccountController,
    OrdersController,
    NowPaymentsIpnController,
    LoaderController,
    AdminController,
  ],
  providers: [
    { provide: CONFIG, useFactory: loadConfig },
    DbService,
    LicencesService,
    OrdersService,
    NowPaymentsClient,
    RoleSyncService,
    CodesService,
    AdminService,
    AuthService,
    DiscordClient,
    UserGuard,
    AdminGuard,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
