import { join } from 'node:path';
import { ContentService } from './content.service';
import { readEntry } from './jar';
import type { AppConfig } from '../config';

/** In-memory stand-ins for the bot (captures the upload) and the db (meta + events). */
class FakeBot {
  configured = true;
  lastUpload?: { channelId: string; filename: string; bytes: Buffer; content?: string };
  async postFile(channelId: string, filename: string, bytes: Uint8Array, content?: string) {
    this.lastUpload = { channelId, filename, bytes: Buffer.from(bytes), content };
    return 'msg-1';
  }
  async deleteMessage() {}
  async postMessage() { return 'msg-2'; }
  async editMessage() {}
}
class FakeDb {
  meta = new Map<string, string>();
  events: string[] = [];
  getMeta(k: string) { return this.meta.get(k) ?? null; }
  setMeta(k: string, v: string) { this.meta.set(k, v); }
  logEvent(_k: string, t: string) { this.events.push(t); }
}

const cfg = {
  bot: { appId: '1559645776416608388', guildId: '1559617778552537131', roleId: '1559617891819724850', affiliateRoleId: '1559628850869182484', downloadsChannelId: '1559619231065051256' },
  adminIds: new Set(['367247878382419970']),
  company: 'FXR Fluxora',
} as unknown as AppConfig;

describe('ContentService.publishJar', () => {
  beforeAll(() => {
    process.env.LOADER_JAR_PATH = join(__dirname, '..', '..', 'assets', 'FXROrderFlow.jar');
  });

  it('patches the jar with this server\'s config and uploads it intact', async () => {
    const bot = new FakeBot();
    const db = new FakeDb();
    const svc = new ContentService(bot as never, db as never, cfg);
    const res = await svc.publishJar(cfg.bot.downloadsChannelId);

    expect(res.messageId).toBe('msg-1');
    expect(res.version).toMatch(/^\d+\.\d+\.\d+$/);
    const jar = bot.lastUpload!.bytes;
    const props = readEntry(jar, 'fxr-license.properties')!.toString('utf8');
    expect(props).toContain('client_id=1559645776416608388');
    expect(props).toContain('guild_id=1559617778552537131');
    expect(props).toContain('role_ids=1559617891819724850,1559628850869182484');
    expect(props).toContain('user_ids=367247878382419970');
    // the encrypted module must be carried over unchanged
    expect(readEntry(jar, 'modules/fxrof.blob')).not.toBeNull();
    expect(bot.lastUpload!.filename).toBe('FXROrderFlow.jar');
    expect(db.meta.get('jar:release')).toContain('msg-1');
  });
});
