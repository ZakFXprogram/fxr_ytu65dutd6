import { crc32, inflateRawSync } from 'node:zlib';

/**
 * Minimal, dependency-free zip handling for the Loader jar: read one entry, and rebuild the archive with one
 * entry added or replaced. Existing entries are copied byte for byte (local header + data + any data
 * descriptor), so nothing the build produced is recompressed or altered.
 */

interface CdEntry {
  name: string;
  localOffset: number;
  method: number;
  compSize: number;
  header: Buffer; // the whole central-directory record (fixed part + name + extra + comment)
}

function findEocd(buf: Buffer): number {
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65_535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) return i;
  }
  throw new Error('not a zip/jar file');
}

function centralDirectory(buf: Buffer): { entries: CdEntry[]; cdOffset: number } {
  const eocd = findEocd(buf);
  const count = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  const entries: CdEntry[] = [];
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('corrupt central directory');
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const len = 46 + nameLen + extraLen + commentLen;
    entries.push({
      name: buf.subarray(p + 46, p + 46 + nameLen).toString('utf8'),
      localOffset,
      method,
      compSize,
      header: Buffer.from(buf.subarray(p, p + len)),
    });
    p += len;
  }
  return { entries, cdOffset };
}

/** Reads one entry's content (stored or deflated), or null if absent. */
export function readEntry(jar: Buffer, name: string): Buffer | null {
  const { entries } = centralDirectory(jar);
  const e = entries.find((x) => x.name === name);
  if (!e) return null;
  const nameLen = jar.readUInt16LE(e.localOffset + 26);
  const extraLen = jar.readUInt16LE(e.localOffset + 28);
  const start = e.localOffset + 30 + nameLen + extraLen;
  const data = jar.subarray(start, start + e.compSize);
  if (e.method === 0) return Buffer.from(data);
  if (e.method === 8) return inflateRawSync(data);
  throw new Error(`unsupported compression for ${name}`);
}

/** Returns a copy of the jar where `name` holds `content` (stored, uncompressed), added or replaced. */
export function withEntry(jar: Buffer, name: string, content: Buffer): Buffer {
  const { entries, cdOffset } = centralDirectory(jar);
  // each local entry spans from its offset to the next entry's offset (or the central directory)
  const offsets = entries.map((e) => e.localOffset).sort((a, b) => a - b);
  const endOf = (off: number) => {
    const next = offsets.find((o) => o > off);
    return next ?? cdOffset;
  };

  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let pos = 0;
  for (const e of entries) {
    if (e.name === name) continue;
    const local = jar.subarray(e.localOffset, endOf(e.localOffset));
    const header = Buffer.from(e.header);
    header.writeUInt32LE(pos, 42); // new local-header offset
    parts.push(local);
    central.push(header);
    pos += local.length;
  }

  const nameBuf = Buffer.from(name, 'utf8');
  const crc = crc32(content) >>> 0;
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4); // version needed
  local.writeUInt16LE(0x0800, 6); // UTF-8 names
  local.writeUInt16LE(0, 8); // stored
  local.writeUInt32LE(0, 10); // time/date
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(content.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28);
  const cd = Buffer.alloc(46);
  cd.writeUInt32LE(0x02014b50, 0);
  cd.writeUInt16LE(20, 4);
  cd.writeUInt16LE(20, 6);
  cd.writeUInt16LE(0x0800, 8);
  cd.writeUInt16LE(0, 10);
  cd.writeUInt32LE(0, 12);
  cd.writeUInt32LE(crc, 16);
  cd.writeUInt32LE(content.length, 20);
  cd.writeUInt32LE(content.length, 24);
  cd.writeUInt16LE(nameBuf.length, 28);
  cd.writeUInt32LE(pos, 42);
  parts.push(local, nameBuf, content);
  central.push(Buffer.concat([cd, nameBuf]));
  pos += local.length + nameBuf.length + content.length;

  const cdBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(central.length, 8);
  eocd.writeUInt16LE(central.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(pos, 16);
  return Buffer.concat([...parts, cdBuf, eocd]);
}
