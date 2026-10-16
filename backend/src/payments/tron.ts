import { createHash } from 'node:crypto';

/**
 * TRON helpers with no dependency: base58check addresses and USDT amounts.
 *
 * A TRON address "T..." is base58check of 21 bytes (0x41 + 20-byte account) + a 4-byte checksum
 * (first 4 bytes of sha256(sha256(payload))). Validating the checksum catches any typo in the receiving
 * address set in the configuration.
 */

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** Tether USD (USDT) on TRON. The only token accepted: a token is identified by its contract, never its name. */
export const USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
export const USDT_DECIMALS = 6;

/** keccak256("Transfer(address,address,uint256)"), topic 0 of every TRC20 Transfer event. */
export const TRANSFER_TOPIC = 'ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

function sha256(b: Buffer): Buffer {
  return createHash('sha256').update(b).digest();
}

function base58Decode(s: string): Buffer | null {
  if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(s)) return null;
  let n = 0n;
  for (const c of s) n = n * 58n + BigInt(ALPHABET.indexOf(c));
  let hex = n === 0n ? '' : n.toString(16);
  if (hex.length % 2) hex = '0' + hex;
  let zeros = 0;
  while (zeros < s.length && s[zeros] === '1') zeros++;
  return Buffer.concat([Buffer.alloc(zeros), Buffer.from(hex, 'hex')]);
}

function base58Encode(b: Buffer): string {
  let n = BigInt('0x' + (b.toString('hex') || '0'));
  let out = '';
  while (n > 0n) {
    out = ALPHABET[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const byte of b) {
    if (byte !== 0) break;
    out = '1' + out;
  }
  return out;
}

/** "T..." -> 21-byte hex ("41" + 40 hex chars), or null when the address or its checksum is invalid. */
export function tronToHex(address: unknown): string | null {
  if (typeof address !== 'string' || address.length !== 34 || address[0] !== 'T') return null;
  const raw = base58Decode(address);
  if (!raw || raw.length !== 25 || raw[0] !== 0x41) return null;
  const payload = raw.subarray(0, 21);
  if (!sha256(sha256(payload)).subarray(0, 4).equals(raw.subarray(21))) return null;
  return payload.toString('hex');
}

/** 21-byte hex ("41..." ) or 20-byte hex -> "T..." address. */
export function hexToTron(hex: string): string | null {
  let h = hex.toLowerCase().replace(/^0x/, '');
  if (/^[0-9a-f]{40}$/.test(h)) h = '41' + h;
  if (!/^41[0-9a-f]{40}$/.test(h)) return null;
  const payload = Buffer.from(h, 'hex');
  return base58Encode(Buffer.concat([payload, sha256(sha256(payload)).subarray(0, 4)]));
}

export function isTronAddress(address: unknown): boolean {
  return tronToHex(address) !== null;
}

/** The 20-byte account part in lowercase hex, as it appears in event topics and logs. */
export function account20(address: string): string {
  const h = tronToHex(address);
  if (!h) throw new Error('invalid TRON address');
  return h.slice(2);
}

export const TXID = /^[0-9a-f]{64}$/;

/** USDT amounts are handled as integers of micro-USDT (6 decimals): no floating point anywhere. */
export function toMicro(usdt: number): number {
  return Math.round(usdt * 1_000_000);
}

/** 8003700 -> "8.0037" (at least minDecimals decimals, trailing zeros removed beyond that). */
export function fromMicro(micro: number | bigint | null | undefined, minDecimals = 2): string {
  if (micro === null || micro === undefined) return '';
  const m = BigInt(micro);
  const neg = m < 0n;
  const a = neg ? -m : m;
  const int = a / 1_000_000n;
  let frac = (a % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
  if (frac.length < minDecimals) frac = frac.padEnd(minDecimals, '0');
  return `${neg ? '-' : ''}${int}.${frac}`;
}
