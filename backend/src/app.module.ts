import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { CONFIG, loadConfig } from './config';
import { DbService } from './db/db.service';
import { LicencesService } from './licences/licences.service';
import { AdminAuth, AdminGuard } from './admin/admin.guard';
import { PublicController } from './public/public.controller';
import { WebhookController } from './public/webhook.controller';
import { LoaderController } from './licences/loader.controller';
import { AdminController } from './admin/admin.controller';

// The Angular build is copied next to the server at deploy time (see Dockerfile). Locally it is two
// directories up in frontend/dist/frontend/browser.
function frontendDir(): string {
  const candidates = [
    join(__dirname, '..', 'public'),
    join(__dirname, '..', '..', 'frontend', 'dist', 'frontend', 'browser'),
  ];
  return candidates.find((p) => existsSync(p)) ?? candidates[0];
}

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    ServeStaticModule.forRoot({
      rootPath: frontendDir(),
      exclude: ['/api/{*rest}'],
      serveStaticOptions: { fallthrough: true },
    }),
  ],
  controllers: [PublicController, WebhookController, LoaderController, AdminController],
  providers: [
    { provide: CONFIG, useFactory: loadConfig },
    DbService,
    LicencesService,
    AdminAuth,
    AdminGuard,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
