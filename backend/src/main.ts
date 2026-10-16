import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import type { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module';
import { loadConfig } from './config';
import { loadSpaPages } from './web';

function notFound(res: Response): void {
  res.status(404).json({ statusCode: 404, message: 'Cannot find this page' });
}

async function bootstrap(): Promise<void> {
  const cfg = loadConfig();
  const log = new Logger('FXR');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  app.set('trust proxy', 1); // Railway's edge proxy: req.ip is the real client (rate limits)
  app.disable('x-powered-by');
  app.useBodyParser('json', { limit: '16kb' });
  app.useBodyParser('urlencoded', { limit: '4kb', extended: false });
  // body-parser errors (too large, broken JSON) get a clean answer instead of falling through
  app.use((err: { status?: number; type?: string } | undefined, _req: Request, res: Response, next: NextFunction) => {
    if (err?.type === 'entity.too.large') return void res.status(413).json({ statusCode: 413, message: 'Request too large' });
    if (err?.status === 400) return void res.status(400).json({ statusCode: 400, message: 'Bad request' });
    next(err);
  });
  app.use(cookieParser());

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"], // Angular inlines component styles
          imgSrc: ["'self'", 'data:', 'https://cdn.discordapp.com'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          upgradeInsecureRequests: cfg.production ? [] : null,
        },
      },
      strictTransportSecurity: cfg.production ? { maxAge: 31536000, includeSubDomains: true } : false,
      referrerPolicy: { policy: 'no-referrer' },
      crossOriginEmbedderPolicy: false,
    }),
  );

  // 1) The panel API lives at /api/<ADMIN_PATH>/...; the internal /api/admin prefix is refused from outside.
  const panelApi = `/api/${cfg.adminPath}/`;
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/api/admin' || req.path.startsWith('/api/admin/')) return notFound(res);
    if (req.url.startsWith(panelApi)) req.url = '/api/admin/' + req.url.slice(panelApi.length);
    next();
  });

  // 2) API hygiene: nothing cached, and state-changing calls must come from our own pages (CSRF defence on top of
  //    SameSite=Strict cookies). The loader and payment notifications carry no cookies and have their own checks.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (!req.path.startsWith('/api/')) return next();
    res.set('Cache-Control', 'no-store');
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
    if (req.path.startsWith('/api/loader/') || req.path.startsWith('/api/payments/')) return next();
    const origin = req.get('origin');
    if (origin === cfg.origin) return next();
    if (!origin && req.get('sec-fetch-site') === 'same-origin') return next();
    res.status(403).json({ statusCode: 403, message: 'Forbidden' });
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

  // 3) Single-page app: any non-API, non-file GET returns index.html so Angular routing works on refresh.
  //    The panel page is the same app plus one meta tag, served only at the secret path.
  const pages = loadSpaPages(cfg.adminPath);
  const panelPage = `/${cfg.adminPath}`;
  app.use((req: Request, res: Response, next: NextFunction) => {
    if ((req.method !== 'GET' && req.method !== 'HEAD') || req.path.startsWith('/api') || req.path.includes('.')) return next();
    if (!pages.site) return next();
    res.type('html');
    if (req.path === panelPage || req.path === panelPage + '/') {
      res.set('Cache-Control', 'no-store');
      res.set('X-Robots-Tag', 'noindex, nofollow');
      return res.send(pages.panel);
    }
    res.set('Cache-Control', 'no-cache');
    res.send(pages.site);
  });

  await app.listen(cfg.port, '0.0.0.0');
  log.log(`FXR web listening on :${cfg.port} (production=${cfg.production})`);
  if (!cfg.production) log.warn(`DEV MODE — panel at ${cfg.publicUrl}${panelPage}`);
  if (!cfg.nowpayments.apiKey) log.warn('NOWPAYMENTS_API_KEY is not set: checkout is closed');
  if (!cfg.bot.token) log.warn('DISCORD_BOT_TOKEN is not set: Discord roles are not synced');
  if (!cfg.discord.clientId || !cfg.discord.clientSecret) log.warn('DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET not both set: sign-in is disabled');
  if (cfg.adminIds.size === 0) log.warn('ADMIN_DISCORD_IDS is not set: nobody can open the owner panel');
}

void bootstrap();
