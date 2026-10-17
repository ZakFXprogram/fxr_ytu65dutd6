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
import { OrdersController, PaymentsController } from './orders/orders.controller';
import { TronClient } from './payments/tron.client';
import { RoleSyncService } from './roles/role-sync.service';
import { CodesService } from './codes/codes.service';
import { AdminService } from './admin/admin.service';
import { AdminController } from './admin/admin.controller';
import { BotService } from './discord/bot.service';
import { InteractionsService } from './discord/interactions.service';
import { InteractionsController } from './discord/interactions.controller';
import { BotAdminController } from './discord/bot-admin.controller';
import { ContentService } from './discord/content.service';
import { RemindersService } from './discord/reminders.service';
import { LoaderSessionService } from './loader/loader-session.service';

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
    PaymentsController,
    LoaderController,
    AdminController,
    InteractionsController,
    BotAdminController,
  ],
  providers: [
    { provide: CONFIG, useFactory: loadConfig },
    DbService,
    LicencesService,
    OrdersService,
    TronClient,
    RoleSyncService,
    CodesService,
    AdminService,
    BotService,
    InteractionsService,
    ContentService,
    RemindersService,
    LoaderSessionService,
    AuthService,
    DiscordClient,
    UserGuard,
    AdminGuard,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
