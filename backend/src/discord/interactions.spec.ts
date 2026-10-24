import { generateKeyPairSync, sign as edSign } from 'node:crypto';
import { InteractionsService } from './interactions.service';
import { parseDuration, durationLabel } from '../licences/licences.service';
import { INTERACTION_PING, REPLY_PONG } from './commands';
import type { AppConfig } from '../config';

/** Builds a service whose only wired dependency is the config (enough for verify()/PING). */
function serviceWithKey(publicKeyHex: string): InteractionsService {
  const cfg = { bot: { publicKey: publicKeyHex }, adminIds: new Set<string>() } as unknown as AppConfig;
  return new InteractionsService(null as never, null as never, null as never, null as never, cfg);
}

describe('Discord interaction signature verification', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  // the raw 32-byte Ed25519 public key is the tail of its SPKI DER encoding
  const der = publicKey.export({ type: 'spki', format: 'der' });
  const publicKeyHex = der.subarray(der.length - 32).toString('hex');
  const svc = serviceWithKey(publicKeyHex);

  const sign = (ts: string, body: string) => edSign(null, Buffer.from(ts + body, 'utf8'), privateKey).toString('hex');

  it('accepts a correctly signed request', () => {
    const ts = '1700000000';
    const body = JSON.stringify({ type: INTERACTION_PING });
    expect(svc.verify(sign(ts, body), ts, Buffer.from(body))).toBe(true);
  });

  it('rejects a tampered body', () => {
    const ts = '1700000000';
    const body = JSON.stringify({ type: INTERACTION_PING });
    const sig = sign(ts, body);
    expect(svc.verify(sig, ts, Buffer.from(body + ' '))).toBe(false);
  });

  it('rejects a wrong timestamp', () => {
    const body = JSON.stringify({ type: INTERACTION_PING });
    expect(svc.verify(sign('1700000000', body), '1700000001', Buffer.from(body))).toBe(false);
  });

  it('rejects a malformed signature', () => {
    expect(svc.verify('zz', '1700000000', Buffer.from('{}'))).toBe(false);
  });

  it('answers the platform PING with a PONG', () => {
    expect(svc.handle({ type: INTERACTION_PING })).toEqual({ type: REPLY_PONG });
  });
});

describe('staff duration parsing', () => {
  it('parses the accepted forms', () => {
    expect(parseDuration('7j')).toBe(7);
    expect(parseDuration('30j')).toBe(30);
    expect(parseDuration('3m')).toBe(90);
    expect(parseDuration('1a')).toBe(365);
    expect(parseDuration('2s')).toBe(14);
    expect(parseDuration('vie')).toBe(0);
    expect(parseDuration('lifetime')).toBe(0);
    expect(parseDuration('45')).toBe(45);
  });

  it('rejects nonsense', () => {
    expect(parseDuration('')).toBe(-1);
    expect(parseDuration('abc')).toBe(-1);
    expect(parseDuration('-5')).toBe(-1);
  });

  it('labels durations in English', () => {
    expect(durationLabel(0)).toBe('lifetime');
    expect(durationLabel(30)).toBe('1 month');
    expect(durationLabel(365)).toBe('1 year');
  });
});
