import { Inject, Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { CONFIG, type AppConfig } from '../config';
import { LicencesService } from '../licences/licences.service';

interface Verdict {
  userId: string;
  userName: string;
  allowed: boolean;
  kind: string;
  createdMs: number;
}

/**
 * Brokers the Loader sign-in through the website, so the member never sees a 127.0.0.1 page. The Loader opens
 * {@code /loader?req=…} in the browser; once the member has signed in on the site, the page calls {@link claim}
 * with that req; the Loader then polls {@link poll} for the verdict and a signed token, and re-checks it with
 * {@link check}. The token is an HMAC over {userId, exp} (APP_SECRET), so no session is kept server-side.
 */
@Injectable()
export class LoaderSessionService {
  private readonly pending = new Map<string, Verdict>();
  private static readonly REQ_TTL_MS = 10 * 60_000;
  private static readonly TOKEN_MS = 7 * 86400_000;

  constructor(
    private readonly licences: LicencesService,
    @Inject(CONFIG) private readonly cfg: AppConfig,
  ) {}

  static validReq(req: unknown): req is string {
    return typeof req === 'string' && /^[a-f0-9]{24,64}$/i.test(req);
  }

  /** The member's browser (signed in) hands us the req after the Discord login on the site. */
  claim(req: string, userId: string, userName: string): { allowed: boolean } {
    this.sweep();
    const lic = this.activeLicence(userId);
    this.pending.set(req, {
      userId,
      userName: userName.slice(0, 64),
      allowed: !!lic,
      kind: lic?.kind || 'premium',
      createdMs: Date.now(),
    });
    return { allowed: !!lic };
  }

  /** The Loader polls this (no auth) until the member has completed the sign-in on the site. */
  poll(req: string): { pending: true } | { ok: true; token: string; user: string; kind: string; expiresAt: number } | { ok: false; reason: string } {
    this.sweep();
    const v = this.pending.get(req);
    if (!v) return { pending: true };
    this.pending.delete(req); // single use
    if (!v.allowed) return { ok: false, reason: 'no active licence' };
    const exp = Date.now() + LoaderSessionService.TOKEN_MS;
    return { ok: true, token: this.sign(v.userId, exp), user: v.userName, kind: v.kind, expiresAt: exp };
  }

  /** The Loader re-validates its token against the current licence state (no auth). */
  check(token: string): { ok: boolean; kind?: string; token?: string; expiresAt?: number; reason?: string } {
    const v = this.verify(token);
    if (!v) return { ok: false, reason: 'bad token' };
    if (v.exp < Date.now()) return { ok: false, reason: 'expired' };
    const lic = this.activeLicence(v.userId);
    if (!lic) return { ok: false, reason: 'no active licence' };
    const exp = Date.now() + LoaderSessionService.TOKEN_MS; // rolling renewal
    return { ok: true, kind: lic.kind || 'premium', token: this.sign(v.userId, exp), expiresAt: exp };
  }

  private activeLicence(userId: string) {
    return this.licences.forUser(userId).find((l) => LicencesService.isActive(l));
  }

  // ---------------------------------------------------------------- token

  private sign(userId: string, exp: number): string {
    const payload = Buffer.from(JSON.stringify({ u: userId, e: exp })).toString('base64url');
    return payload + '.' + this.mac(payload);
  }

  private verify(token: string): { userId: string; exp: number } | null {
    const i = token.lastIndexOf('.');
    if (i <= 0) return null;
    const payload = token.slice(0, i);
    const got = token.slice(i + 1);
    const want = this.mac(payload);
    const a = Buffer.from(got);
    const b = Buffer.from(want);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    try {
      const j = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { u?: unknown; e?: unknown };
      if (typeof j.u !== 'string' || typeof j.e !== 'number') return null;
      return { userId: j.u, exp: j.e };
    } catch {
      return null;
    }
  }

  private mac(payload: string): string {
    return createHmac('sha256', this.cfg.appSecret + ':loader').update(payload).digest('base64url');
  }

  private sweep(): void {
    const cutoff = Date.now() - LoaderSessionService.REQ_TTL_MS;
    for (const [k, v] of this.pending) if (v.createdMs < cutoff) this.pending.delete(k);
  }
}
