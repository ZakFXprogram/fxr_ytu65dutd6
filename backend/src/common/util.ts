import { NotFoundException } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';

export function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Our row ids are 24 hex chars; anything else is answered 404 without touching the database. */
export function assertId(id: unknown): string {
  if (typeof id !== 'string' || !/^[0-9a-f]{24}$/.test(id)) throw new NotFoundException();
  return id;
}

/** Where to send the browser after login: only a path on this site, never another host. */
export function sanitizeNext(n: unknown, fallback = '/account'): string {
  if (typeof n !== 'string' || n.length === 0 || n.length > 200) return fallback;
  if (!n.startsWith('/') || n.startsWith('//') || n.startsWith('/api')) return fallback;
  if (n.includes('\\') || /[\x00-\x1f\x7f]/.test(n)) return fallback;
  return n;
}

export const DISCORD_ID = /^\d{17,20}$/;
