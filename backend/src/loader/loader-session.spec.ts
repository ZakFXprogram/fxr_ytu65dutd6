import { LoaderSessionService } from './loader-session.service';
import type { AppConfig } from '../config';

function service(active: boolean): LoaderSessionService {
  const licences = {
    forUser: () => (active ? [{ status: 'active', end_ms: 0, kind: 'premium' }] : []),
  } as never;
  const cfg = { appSecret: 'x'.repeat(40) } as unknown as AppConfig;
  return new LoaderSessionService(licences, cfg);
}

describe('LoaderSessionService (site-brokered loader sign-in)', () => {
  it('claim → poll hands the Loader a signed token, once', () => {
    const svc = service(true);
    const req = 'a'.repeat(32);
    expect(svc.claim(req, '367247878382419970', 'Zak')).toEqual({ allowed: true });
    const r = svc.poll(req) as { ok: true; token: string; user: string; expiresAt: number };
    expect(r.ok).toBe(true);
    expect(r.user).toBe('Zak');
    expect(r.token).toContain('.');
    expect(r.expiresAt).toBeGreaterThan(Date.now());
    // single use: a second poll no longer has it
    expect(svc.poll(req)).toEqual({ pending: true });
  });

  it('poll before claim is pending', () => {
    expect(service(true).poll('b'.repeat(32))).toEqual({ pending: true });
  });

  it('claim for a member with no active licence is refused at poll', () => {
    const svc = service(false);
    const req = 'c'.repeat(32);
    expect(svc.claim(req, '1', 'NoLic')).toEqual({ allowed: false });
    expect(svc.poll(req)).toEqual({ ok: false, reason: 'no active licence' });
  });

  it('check re-validates a real token and rolls it', () => {
    const svc = service(true);
    const req = 'd'.repeat(32);
    svc.claim(req, '42', 'Z');
    const token = (svc.poll(req) as { token: string }).token;
    const r = svc.check(token) as { ok: true; token: string; expiresAt: number };
    expect(r.ok).toBe(true);
    expect(typeof r.token).toBe('string');
  });

  it('check rejects a tampered token', () => {
    const svc = service(true);
    const req = 'e'.repeat(32);
    svc.claim(req, '42', 'Z');
    const token = (svc.poll(req) as { token: string }).token;
    expect(svc.check(token + 'x')).toEqual(expect.objectContaining({ ok: false }));
    expect(svc.check('garbage.garbage')).toEqual(expect.objectContaining({ ok: false }));
  });

  it('check fails once the licence is gone, even with a valid token', () => {
    const good = service(true);
    const req = 'f'.repeat(32);
    good.claim(req, '42', 'Z');
    const token = (good.poll(req) as { token: string }).token;
    // same token, but now the member has no active licence
    const gone = service(false);
    expect(gone.check(token)).toEqual(expect.objectContaining({ ok: false, reason: 'no active licence' }));
  });
});
