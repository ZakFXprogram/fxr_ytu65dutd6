import { TicketsService, REASONS } from './tickets.service';
import { INTERACTION_COMPONENT, INTERACTION_MODAL, REPLY_MODAL, REPLY_DEFERRED, REPLY_MESSAGE, type Interaction } from './commands';
import type { AppConfig } from '../config';

function make() {
  const meta = new Map<string, string>();
  const db = {
    getMeta: (k: string) => meta.get(k) ?? null,
    setMeta: (k: string, v: string) => void meta.set(k, v),
    run: () => 0,
    logEvent: () => {},
  };
  const created: unknown[] = [];
  const posted: unknown[] = [];
  const edits: unknown[] = [];
  const bot = {
    guildId: 'G',
    botUserId: 'B',
    getChannel: async () => null,
    listChannels: async () => [],
    listRoles: async () => [
      { id: 'G', name: '@everyone', position: 0 },
      { id: 'R1', name: '🛡️ Support', position: 3 },
      { id: 'R2', name: 'Premium', position: 2 },
    ],
    createChannel: async (b: { name: string; type: number }) => {
      created.push(b);
      return { id: b.type === 4 ? 'CAT' : 'CH1', type: b.type, name: b.name };
    },
    postMessage: async (_c: string, p: unknown) => {
      posted.push(p);
      return 'M1';
    },
    editInteractionReply: async (_t: string, p: unknown) => void edits.push(p),
    deleteChannel: async () => {},
  };
  const cfg = { bot: { staffRoleIds: [] }, adminIds: new Set(['OWNER']) } as unknown as AppConfig;
  return { svc: new TicketsService(bot as never, db as never, cfg), meta, created, posted, edits };
}

const member = (id: string) => ({ member: { user: { id, username: 'zak' }, roles: [] } });

describe('tickets', () => {
  it('panel has one button per reason', () => {
    const { svc } = make();
    const row = (svc.panelPayload().components[0] as { components: { custom_id: string }[] }).components;
    expect(row.map((b) => b.custom_id)).toEqual(REASONS.map((r) => `ticket:open:${r.id}`));
  });

  it('a reason button opens a form, sending it creates a private channel', async () => {
    const { svc, meta, created, posted, edits } = make();
    const open = svc.handle({ type: INTERACTION_COMPONENT, data: { name: '', custom_id: 'ticket:open:license' }, ...member('U1') } as Interaction);
    expect(open.type).toBe(REPLY_MODAL);
    const sent = svc.handle({
      type: INTERACTION_MODAL,
      token: 'T',
      data: { name: '', custom_id: 'ticket:submit:license', components: [{ components: [{ custom_id: 'details', value: 'My key does not work' }] }] },
      ...member('U1'),
    } as Interaction);
    expect(sent.type).toBe(REPLY_DEFERRED);
    await new Promise((ok) => setTimeout(ok, 10));
    const ch = created.find((c) => (c as { type: number }).type === 0) as { name: string; permission_overwrites: { id: string; deny: string }[] };
    expect(ch.name).toBe('license-0001-zak');
    expect(ch.permission_overwrites.find((o) => o.id === 'G')!.deny).toBe(String(1 << 10)); // hidden from @everyone
    expect(ch.permission_overwrites.map((o) => o.id)).toEqual(expect.arrayContaining(['B', 'R1', 'U1']));
    expect(ch.permission_overwrites.map((o) => o.id)).not.toContain('R2');
    expect(posted).toHaveLength(1);
    expect(meta.get('ticket:chan:CH1')).toBe('U1');
    expect(JSON.stringify(edits[0])).toContain('<#CH1>');
  });

  it('only the owner or staff can close', () => {
    const { svc, meta } = make();
    meta.set('ticket:chan:CH1', 'U1');
    const close = (id: string) => svc.handle({ type: INTERACTION_COMPONENT, channel_id: 'CH1', data: { name: '', custom_id: 'ticket:close' }, ...member(id) } as Interaction);
    expect(close('U2').data?.content).toContain('⛔');
    jest.useFakeTimers();
    expect(close('U1').type).toBe(REPLY_MESSAGE);
    expect(close('OWNER').type).toBe(REPLY_MESSAGE);
    jest.useRealTimers();
  });
});
