import { Inject, Injectable } from '@nestjs/common';
import { CONFIG, type AppConfig } from '../config';
import { TRANSFER_TOPIC, TXID, USDT_CONTRACT, account20, hexToTron } from './tron';

/** One incoming USDT transfer as listed by the index (TronGrid). */
export interface IndexedTransfer {
  txid: string;
  from: string;
  to: string;
  contract: string;
  type: string;
  value: bigint; // micro-USDT
  blockMs: number;
}

/** What a confirmed-only node says about one transaction: the USDT that reached OUR address in it. */
export interface CheckedTx {
  txid: string;
  success: boolean;
  blockMs: number;
  value: bigint; // micro-USDT sent to our address by the real USDT contract in this transaction
  from: string | null;
}

/**
 * Read-only access to the TRON blockchain. Two sources, used for different things:
 *  - the index (TronGrid /v1) lists the confirmed USDT transfers that reached our address;
 *  - a node's "solidity" API (confirmed blocks only) is asked again about every single transaction, and its
 *    receipt and event logs are decoded here: success flag, emitting contract, Transfer topic, recipient, value.
 * A payment counts only when both agree. Nothing here can sign or send anything: there is no key.
 */
@Injectable()
export class TronClient {
  private readonly usdt20 = account20(USDT_CONTRACT);

  constructor(@Inject(CONFIG) private readonly cfg: AppConfig) {}

  get configured(): boolean {
    return !!this.cfg.tron.address;
  }

  get address(): string {
    return this.cfg.tron.address;
  }

  private headers(key: string): Record<string, string> {
    const h: Record<string, string> = { Accept: 'application/json' };
    if (key) h['TRON-PRO-API-KEY'] = key;
    return h;
  }

  /** Confirmed USDT transfers TO our address with a block time >= sinceMs, oldest first. */
  async incoming(sinceMs: number, maxPages = 20): Promise<IndexedTransfer[]> {
    const t = this.cfg.tron;
    const out: IndexedTransfer[] = [];
    let fingerprint = '';
    for (let page = 0; page < maxPages; page++) {
      const u = new URL(`${t.apiBase}/v1/accounts/${encodeURIComponent(t.address)}/transactions/trc20`);
      u.searchParams.set('only_confirmed', 'true');
      u.searchParams.set('only_to', 'true');
      u.searchParams.set('contract_address', USDT_CONTRACT);
      u.searchParams.set('min_timestamp', String(Math.max(0, Math.floor(sinceMs))));
      u.searchParams.set('order_by', 'block_timestamp,asc');
      u.searchParams.set('limit', '200');
      if (fingerprint) u.searchParams.set('fingerprint', fingerprint);
      const r = await fetch(u, { headers: this.headers(t.apiKey), signal: AbortSignal.timeout(10_000) });
      if (!r.ok) throw new Error(`index answered ${r.status}`);
      const j = (await r.json()) as { success?: boolean; data?: unknown[]; meta?: { fingerprint?: string } };
      if (j.success === false || !Array.isArray(j.data)) throw new Error('index answered an error');
      for (const raw of j.data) {
        const d = raw as Record<string, unknown>;
        const token = (d['token_info'] ?? {}) as Record<string, unknown>;
        const value = String(d['value'] ?? '');
        const txid = String(d['transaction_id'] ?? '').toLowerCase();
        if (!TXID.test(txid) || !/^\d{1,30}$/.test(value)) continue;
        out.push({
          txid,
          from: String(d['from'] ?? ''),
          to: String(d['to'] ?? ''),
          contract: String(token['address'] ?? ''),
          type: String(d['type'] ?? ''),
          value: BigInt(value),
          blockMs: Number(d['block_timestamp'] ?? 0),
        });
      }
      fingerprint = j.meta?.fingerprint ?? '';
      if (!fingerprint || j.data.length === 0) break;
    }
    return out;
  }

  /**
   * Re-reads one transaction from confirmed blocks and decodes it ourselves. Returns null while the transaction
   * is unknown or not confirmed yet.
   */
  async check(txid: string): Promise<CheckedTx | null> {
    if (!TXID.test(txid)) return null;
    const t = this.cfg.tron;
    const r = await fetch(`${t.nodeUrl}/walletsolidity/gettransactioninfobyid`, {
      method: 'POST',
      headers: { ...this.headers(t.nodeApiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: txid }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) throw new Error(`node answered ${r.status}`);
    const j = (await r.json()) as Record<string, unknown>;
    if (!j || typeof j !== 'object' || !j['id']) return null; // not found / not confirmed yet
    if (String(j['id']).toLowerCase() !== txid) throw new Error('node returned another transaction');

    const receipt = (j['receipt'] ?? {}) as Record<string, unknown>;
    const success = receipt['result'] === 'SUCCESS' && j['result'] !== 'FAILED';
    const ours = account20(t.address);
    let value = 0n;
    let from: string | null = null;
    for (const raw of Array.isArray(j['log']) ? j['log'] : []) {
      const log = raw as Record<string, unknown>;
      const emitter = String(log['address'] ?? '').toLowerCase().replace(/^41(?=[0-9a-f]{40}$)/, '');
      if (emitter !== this.usdt20) continue; // emitted by another contract: a fake "USDT"
      const topics = Array.isArray(log['topics']) ? (log['topics'] as unknown[]).map((x) => String(x).toLowerCase()) : [];
      if (topics.length !== 3 || topics[0] !== TRANSFER_TOPIC) continue;
      if (topics[2].slice(-40) !== ours) continue; // to someone else
      const data = String(log['data'] ?? '').toLowerCase();
      if (!/^[0-9a-f]{1,64}$/.test(data)) continue;
      value += BigInt('0x' + data);
      from = hexToTron(topics[1].slice(-40));
    }
    return { txid, success, blockMs: Number(j['blockTimeStamp'] ?? 0), value, from };
  }
}
