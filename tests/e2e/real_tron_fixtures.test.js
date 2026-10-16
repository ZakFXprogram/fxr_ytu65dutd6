// Feeds REAL TronGrid responses (captured from api.trongrid.io on 2026-10-17) to the site's TronClient.
const http = require('http');
const { TronClient } = require(require('path').join(__dirname, '../../backend/dist/payments/tron.client.js'));
const { hexToTron } = require(require('path').join(__dirname, '../../backend/dist/payments/tron.js'));
const T = 'ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const pad = (h) => h.padStart(64, '0');
const USDT20 = 'a614f803b6fd780986a42c78ec9c7f77e6ded13c';
const single = { id: 'e9b205aaf94ba7dc7d92d5fd4cc0e4c64633f9cd07eeaa2bca608485a2b67ba8', fee: 345000, blockNumber: 87172917, blockTimeStamp: 1792191717000,
  contractResult: ['0000000000000000000000000000000000000000000000000000000000000001'], contract_address: '41a614f803b6fd780986a42c78ec9c7f77e6ded13c',
  receipt: { energy_usage: 64285, energy_usage_total: 64285, net_fee: 345000, result: 'SUCCESS', energy_penalty_total: 49635 },
  log: [{ address: USDT20, topics: [T, pad('3de106d88332d44233a4617da22ec2170593bb4f'), pad('74d373ff2669d647708a1c6b4ff33887fe7a88ad')], data: pad('989680') }] };
const multi = { id: '410310cc4c3133bbe19544fe81b541604249dd62a200d8a373581bd8e85bbd8d', blockNumber: 87172917, blockTimeStamp: 1792191717000, contract_address: '4139dd12a54e2bab7c82aa14a1e158b34263d2d510',
  receipt: { energy_usage: 154896, energy_usage_total: 154896, net_usage: 701, result: 'SUCCESS', energy_penalty_total: 102397 },
  log: [
    { address: USDT20, topics: [T, pad('3b9ad3e74ec2eb0c8c5c9b34afb5f0a59077d710'), pad('76b5c8429b78a38643e5ff9a94b4ca10c1efd867')], data: pad('16e360') },
    { address: USDT20, topics: [T, pad('3b9ad3e74ec2eb0c8c5c9b34afb5f0a59077d710'), pad('80cb6f01c7c4ad68494d9d3ed52b413ddfbac8fd')], data: pad('6fc23ac00') },
  ] };
const index = { data: [
  { transaction_id: single.id, token_info: { symbol: 'USDT', address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', decimals: 6, name: 'Tether USD' }, block_timestamp: 1792191717000,
    from: 'TFcPntjRPUh5Dd2zGkBHkE6WqsycvXtdNt', to: 'TLcvhLA9DohjHuRmy6FW2f1Trf23YAzJH8', type: 'Transfer', value: '10000000' },
  { transaction_id: '4dc3c9f560f4f476a28cb2552b0d397538943d3fd77de63a4876cfedefb9c54f', token_info: { symbol: 'USDT', address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', decimals: 6, name: 'Tether USD' },
    block_timestamp: 1792191720000, from: 'TSsoGf62eJwfkspswdwn8ED25kmh7mt65K', to: 'TLcvhLA9DohjHuRmy6FW2f1Trf23YAzJH8', type: 'Transfer', value: '100000000' },
], success: true, meta: { at: 1792191824401, page_size: 2 } };

let lastIndexUrl = '';
const srv = http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
    res.setHeader('content-type', 'application/json');
    if (req.url.startsWith('/v1/accounts/')) { lastIndexUrl = req.url; return res.end(JSON.stringify(index)); }
    const id = JSON.parse(b || '{}').value;
    res.end(JSON.stringify(id === single.id ? single : id === multi.id ? multi : {}));
  });
}).listen(9997, async () => {
  let ok = 0, bad = 0;
  const check = (n, c, i = '') => { c ? ok++ : bad++; console.log(c ? '  PASS' : '  FAIL', n, c ? '' : i); };
  const client = (addr) => new TronClient({ tron: { address: addr, apiBase: 'http://localhost:9997', nodeUrl: 'http://localhost:9997', apiKey: '', nodeApiKey: '' } });
  const a = client('TLcvhLA9DohjHuRmy6FW2f1Trf23YAzJH8');
  const list = await a.incoming(1792191657000);
  check('index: real response parsed', list.length === 2 && list[0].value === 10000000n && list[0].contract === 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t' && list[0].blockMs === 1792191717000, JSON.stringify(list, (k, v) => typeof v === 'bigint' ? String(v) : v));
  check('index query has the right filters', /only_confirmed=true/.test(lastIndexUrl) && /only_to=true/.test(lastIndexUrl) && /contract_address=TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t/.test(lastIndexUrl), lastIndexUrl);
  const c = await a.check(single.id);
  check('node: real receipt decoded, 10 USDT to us, success', c && c.success && c.value === 10000000n && c.blockMs === 1792191717000, String(c && c.value));
  check('node: sender decoded from the log', c && c.from === 'TFcPntjRPUh5Dd2zGkBHkE6WqsycvXtdNt', c && c.from);
  const m = await a.check(multi.id);
  check('multi-transfer tx paying OTHER wallets -> 0 for us', m && m.value === 0n, String(m && m.value));
  const b = client(hexToTron('76b5c8429b78a38643e5ff9a94b4ca10c1efd867'));
  const mb = await b.check(multi.id);
  check('multi-transfer tx via a router contract: only our 1.5 USDT counted', mb && mb.success && mb.value === 1500000n, String(mb && mb.value));
  const none = await a.check('00'.repeat(32));
  check('unknown tx -> null (not confirmed yet)', none === null);
  console.log(`\n${ok} passed, ${bad} failed`); srv.close(); process.exit(bad ? 1 : 0);
});
