import { CanActivate, ExecutionContext, Injectable, Inject, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual, createHmac, randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { CONFIG, type AppConfig } from '../config';

const COOKIE = 'fxr_admin';
const TTL_MS = 8 * 3600_000;

/** Signs/verifies a stateless admin session cookie: base64(expiry).hmac. */
@Injectable()
export class AdminAuth {
  constructor(@Inject(CONFIG) private readonly cfg: AppConfig) {}

  private secret(): Buffer {
    // derived from the admin password, stable across restarts without storing a separate key
    return createHmac('sha256', 'fxr-admin-session').update(this.cfg.adminPassword).digest();
  }

  login(user: string, password: string): string | null {
    const ok = safeEqual(user, this.cfg.adminUser) && safeEqual(password, this.cfg.adminPassword) && password.length > 0;
    if (!ok) return null;
    const exp = Date.now() + TTL_MS;
    const payload = Buffer.from(String(exp)).toString('base64url');
    const sig = createHmac('sha256', this.secret()).update(payload).digest('base64url');
    return `${payload}.${sig}`;
  }

  valid(token: string | undefined): boolean {
    if (!token) return false;
    const [payload, sig] = token.split('.');
    if (!payload || !sig) return false;
    const want = createHmac('sha256', this.secret()).update(payload).digest('base64url');
    if (!safeEqual(sig, want)) return false;
    const exp = parseInt(Buffer.from(payload, 'base64url').toString(), 10);
    return Number.isFinite(exp) && exp > Date.now();
  }

  setCookie(res: Response, token: string): void {
    res.cookie(COOKIE, token, {
      httpOnly: true,
      secure: this.cfg.production,
      sameSite: 'strict',
      maxAge: TTL_MS,
      path: '/',
    });
  }

  clearCookie(res: Response): void {
    res.clearCookie(COOKIE, { path: '/' });
  }

  readCookie(req: Request): string | undefined {
    return (req.cookies as Record<string, string> | undefined)?.[COOKIE];
  }

  /** A fresh CSRF token (double-submit cookie pattern). */
  static csrfToken(): string {
    return randomBytes(16).toString('hex');
  }
}

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly auth: AdminAuth) {}
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (!this.auth.valid(this.auth.readCookie(req))) throw new UnauthorizedException('not signed in');
    return true;
  }
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
