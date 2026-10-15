import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import type { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module';
import { loadConfig } from './config';

async function bootstrap(): Promise<void> {
  const cfg = loadConfig();
  const app = await NestFactory.create(AppModule, { logger: ['log', 'warn', 'error'] });

  app.getHttpAdapter().getInstance().set('trust proxy', 1); // Railway's edge proxy
  app.use(cookieParser());
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"], // Angular inlines component styles
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          frameAncestors: ["'none'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

  // SPA fallback: any non-API, non-file GET returns index.html so Angular routing works on refresh.
  const indexHtml = resolveIndex();
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.includes('.')) return next();
    if (indexHtml) return res.sendFile(indexHtml);
    next();
  });

  await app.listen(cfg.port, '0.0.0.0');
  new Logger('FXR').log(`FXR web listening on :${cfg.port} (production=${cfg.production})`);
}

function resolveIndex(): string | null {
  for (const p of [
    join(__dirname, '..', 'public', 'index.html'),
    join(__dirname, '..', '..', 'frontend', 'dist', 'frontend', 'browser', 'index.html'),
  ]) {
    if (existsSync(p)) return p;
  }
  return null;
}

void bootstrap();
