// Local stand-in for the TRON blockchain (TronGrid index + solidity node), for tests only.
// It deliberately returns EVERY transfer it knows (any token, any recipient) so the site's own filters are tested.
const http = require('http');
const crypto = require('crypto');
const { URL } = require('url');

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58hex(s) {
  let n = 0n;
  for (const c of s) n = n * 58n + BigInt(ALPHABET.indexOf(c));
  let h = n.toString(16);
  if (h.length % 2) h = '0' + h;
  return h.slice(0, 42); // 21 bytes, drop the checksum
}
const USDT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const TOPIC = 'ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const pad = (h) => h.padStart(64, '0');

let txs = []; // { txid, from, to, contract, value, blockMs, success, inIndex, inNode, nodeValue }
let calls = { index: 0, node: 0 };

function send(res, code, obj) {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(obj));
}

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost:9998');
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    if (u.pathname === '/_reset') { txs = []; calls = { index: 0, node: 0 }; return send(res, 200, { ok: true }); }
    if (u.pathname === '/_calls') return send(res, 200, calls);
    if (u.pathname === '/_tx' && req.method === 'POST') {
      const j = JSON.parse(body || '{}');
      const t = {
        txid: j.txid || crypto.randomBytes(32).toString('hex'),
        from: j.from, to: j.to,
        contract: j.contract || USDT,
        value: String(j.value),
        blockMs: j.blockMs || Date.now() - 3000,
        success: j.success !== false,
        inIndex: j.inIndex !== false,
        inNode: j.inNode !== false,
        nodeValue: j.nodeValue === undefined ? null : String(j.nodeValue),
      };
      txs.push(t);
      return send(res, 200, t);
    }
    if (u.pathname === '/_set' && req.method === 'POST') {
      const j = JSON.parse(body || '{}');
      const t = txs.find((x) => x.txid === j.txid);
      if (!t) return send(res, 404, {});
      Object.assign(t, j.set);
      return send(res, 200, t);
    }

    let m = u.pathname.match(/^\/v1\/accounts\/(T[1-9A-HJ-NP-Za-km-z]{33})\/transactions\/trc20$/);
    if (m && req.method === 'GET') {
      calls.index++;
      const min = Number(u.searchParams.get('min_timestamp') || 0);
      const limit = Number(u.searchParams.get('limit') || 20);
      const offset = Number(u.searchParams.get('fingerprint') || 0);
      const all = txs.filter((t) => t.inIndex && t.blockMs >= min).sort((a, b) => a.blockMs - b.blockMs);
      const page = all.slice(offset, offset + limit);
      const data = page.map((t) => ({
        transaction_id: t.txid,
        token_info: { symbol: 'USDT', address: t.contract, decimals: 6, name: 'Tether USD' },
        block_timestamp: t.blockMs,
        from: t.from, to: t.to, type: 'Transfer', value: t.value,
      }));
      const meta = { at: Date.now(), page_size: data.length };
      if (offset + limit < all.length) meta.fingerprint = String(offset + limit);
      return send(res, 200, { data, success: true, meta });
    }
    if (u.pathname === '/walletsolidity/gettransactioninfobyid' && req.method === 'POST') {
      calls.node++;
      const id = JSON.parse(body || '{}').value;
      const t = txs.find((x) => x.txid === id);
      if (!t || !t.inNode) return send(res, 200, {});
      const value = BigInt(t.nodeValue ?? t.value);
      const out = {
        id: t.txid, fee: 345000, blockNumber: 60000000, blockTimeStamp: t.blockMs,
        contractResult: [''], contract_address: b58hex(t.contract),
        receipt: { energy_usage_total: 14650, net_usage: 345, result: t.success ? 'SUCCESS' : 'REVERT' },
        log: t.success ? [{
          address: b58hex(t.contract).slice(2),
          topics: [TOPIC, pad(b58hex(t.from).slice(2)), pad(b58hex(t.to).slice(2))],
          data: pad(value.toString(16)),
        }] : [],
      };
      if (!t.success) out.result = 'FAILED';
      return send(res, 200, out);
    }
    send(res, 404, { error: 'not found' });
  });
}).listen(9998, () => console.log('mock tron on 9998'));
