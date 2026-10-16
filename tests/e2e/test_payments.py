"""End-to-end + security checks: direct USDT (TRC20) payments read from the blockchain, redeem keys, sessions,
Discord roles, admin API."""
import os, re, sqlite3, subprocess, sys, time
import requests

B = 'http://localhost:8099'
M = 'http://localhost:9999'
T = 'http://localhost:9998'
PANEL = 'ops-k3v9q2m7x8w1z4'
A = f'{B}/api/{PANEL}'
O = {'Origin': B}
SP = os.environ['FXR_TEST_DIR']  # set by run.sh
DB = f'{SP}/data/fxr.sqlite'
ADDR = 'TCSXib4mbvTrd2onzcy8zhAjmNYw6DAnzR'   # our receiving address
PAYER = 'TFZ1aje1RwrmoDtjoD9Svi8yamnXSNJUVe'
OTHER = 'TH7FWovdLxZEPKSDCWEbtid6VUQKdXbdr4'   # someone else's wallet
FAKE = 'TJfVStDFFyFgyQygboKkrj7DQB27ovH3Ub'    # a token contract that calls itself "USDT"
ok = fail = 0


def check(name, cond, info=''):
    global ok, fail
    if cond:
        ok += 1
        print('  PASS', name)
    else:
        fail += 1
        print('  FAIL', name, info)


_ip = [10]


def login(persona, nxt='/dashboard', ua=None):
    requests.get(f'{M}/_as/{persona}')
    s = requests.Session()
    _ip[0] += 1
    s.headers['X-Forwarded-For'] = f'10.0.0.{_ip[0]}'  # each test user is its own client for the rate limits
    if ua:
        s.headers['User-Agent'] = ua
    s.get(f'{B}/api/auth/discord', params={'next': nxt})
    return s


def roles():
    return requests.get(f'{M}/_stats').json()['roles']


def micro(a):
    return int(round(float(a) * 1_000_000))


def tx(value, **kw):
    """Puts a USDT transfer on the mock chain (to our address unless said otherwise)."""
    body = {'from': PAYER, 'to': ADDR, 'value': value, **kw}
    return requests.post(f'{T}/_tx', json=body).json()


def wait(s, oid, want, timeout=6.0):
    end = time.time() + timeout
    st = None
    while time.time() < end:
        st = s.get(f'{B}/api/orders/{oid}').json()
        if st['status'] == want:
            return st
        time.sleep(0.2)
    return st


def settle(seconds=1.5):
    time.sleep(seconds)


def order(s, plan):
    return s.post(f'{B}/api/orders', json={'plan': plan, 'acceptTerms': True}, headers=O).json()


def db():
    return sqlite3.connect(DB)


print('public + hardening')
check('panel api hidden', requests.get(f'{A}/overview').status_code == 404)
check('internal /api/admin hidden', requests.get(f'{B}/api/admin/overview').status_code == 404)
check('old NOWPayments webhook gone', requests.post(f'{B}/api/payments/nowpayments/ipn', json={}).status_code in (403, 404))
check('buy needs Discord sign-in', requests.post(f'{B}/api/orders', json={'plan': 'month1', 'acceptTerms': True}, headers=O).status_code == 401)
check('payments open', requests.get(f'{B}/api/site').json()['paymentsOpen'] is True)
qr = requests.get(f'{B}/api/payments/qr.svg')
check('address QR code served as SVG', qr.status_code == 200 and qr.headers['content-type'].startswith('image/svg+xml') and '<svg' in qr.text)

print('checkout: unique amounts')
alice = login('alice', ua='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36')
check('terms must be accepted', alice.post(f'{B}/api/orders', json={'plan': 'month1'}, headers=O).status_code == 400)
o = order(alice, 'month1')
p = o.get('pay') or {}
check('order shows our address', p.get('address') == ADDR, o)
check('amount = price + unique 0.0001-0.0099', re.fullmatch(r'8\.00\d\d', p.get('amount', '')) and 8_000_100 <= micro(p['amount']) <= 8_009_900, p.get('amount'))
check('USDT contract and network shown', p.get('contract') == 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t' and 'TRC20' in p.get('network', ''))
check('price stays 8.00', o['amount'] == '8.00')
check('second click reuses the same order', order(alice, 'month1')['id'] == o['id'])
bob = login('bob')
amounts = {p['amount']}
bo = [order(bob, pl) for pl in ('month1', 'month3', 'month6')]
amounts |= {x['pay']['amount'] for x in bo}
check('every open order gets its own amount', len(amounts) == 4, amounts)
check('max 3 open orders per member', bob.post(f'{B}/api/orders', json={'plan': 'year1', 'acceptTerms': True}, headers=O).status_code == 429)

print('blockchain: what must NOT pay')
exact = p['amount']
tx(micro(exact), contract=FAKE)
tx(micro(exact), to=OTHER)
f = tx(micro(exact), success=False)
d = tx(micro(exact), nodeValue=micro(exact) - 1)
settle(2)
check('fake "USDT" token, payment to another wallet, failed tx, disagreeing sources -> still pending',
      alice.get(f'{B}/api/orders/{o["id"]}').json()['status'] == 'pending')
row = {r[0]: (r[1], r[2]) for r in db().execute('SELECT txid, status, note FROM chain_transfers')}
check('failed tx recorded as ignored', row.get(f['txid'], ('',))[0] == 'ignored', row.get(f['txid']))
check('disagreeing sources recorded as ignored', row.get(d['txid'], ('',))[0] == 'ignored' and 'disagree' in (row[d['txid']][1] or ''), row.get(d['txid']))
check('fake token and other recipient never even recorded', len(row) == 2, len(row))
check('no licence given', alice.get(f'{B}/api/account').json()['licences'] == [])

print('blockchain: paying')
h = tx(micro(exact), inNode=False)  # index sees it, node not yet
settle(1.5)
check('not confirmed by the node yet -> waits', alice.get(f'{B}/api/orders/{o["id"]}').json()['status'] == 'pending')
requests.post(f'{T}/_set', json={'txid': h['txid'], 'set': {'inNode': True}})
st = wait(alice, o['id'], 'paid')
check('exact amount confirmed by both sources -> paid', st['status'] == 'paid', st)
check('order shows the transaction and the amount received', st['txid'] == h['txid'] and st['received'] == exact, st)
acc = alice.get(f'{B}/api/account').json()
check('licence active', len(acc['licences']) == 1 and acc['licences'][0]['status'] == 'active', acc['licences'])
settle(1.2)
check('Discord role given', '333333333333333333' in roles(), roles())
end1 = acc['licences'][0]['expiresAt']
check('payer address stored (public)', db().execute('SELECT payer FROM orders WHERE id = ?', (o['id'],)).fetchone()[0] == PAYER)

print('transaction id given by the buyer (exchanges)')
b3 = bo[1]  # bob month3, 24.00xx
xt = tx(24_000_000)  # an exchange sent a round 24.00
settle(1.5)
check('round amount from an exchange does not match by itself', bob.get(f'{B}/api/orders/{b3["id"]}').json()['status'] == 'pending')
check('...and waits for the owner as unmatched', db().execute("SELECT status FROM chain_transfers WHERE txid = ?", (xt['txid'],)).fetchone()[0] == 'unmatched')
check('bad txid format refused', bob.post(f'{B}/api/orders/{b3["id"]}/txid', json={'txid': 'xyz'}, headers=O).status_code == 400)
check('cannot claim on someone else\'s order', alice.post(f'{B}/api/orders/{b3["id"]}/txid', json={'txid': xt['txid']}, headers=O).status_code == 404)
r = bob.post(f'{B}/api/orders/{b3["id"]}/txid', json={'txid': xt['txid'].upper()}, headers=O)
check('bob gives the transaction id -> paid', r.status_code == 201 and r.json()['status'] == 'paid', r.text)
check('used transaction cannot pay another order', alice.post(f'{B}/api/orders/{order(alice, "month6")["id"]}/txid', json={'txid': xt['txid']}, headers=O).status_code == 409)
check('transaction already paying alice cannot be claimed', bob.post(f'{B}/api/orders/{bo[2]["id"]}/txid', json={'txid': h['txid']}, headers=O).status_code == 409)

failed_claim = bob.post(f'{B}/api/orders/{bo[2]["id"]}/txid', json={'txid': f['txid']}, headers=O)
check('failed transaction refused', failed_claim.status_code in (409, 422), failed_claim.text)
ot = tx(48_000_000, to=OTHER)
r = bob.post(f'{B}/api/orders/{bo[2]["id"]}/txid', json={'txid': ot['txid']}, headers=O)
check('transaction to another wallet refused', r.status_code == 422 and 'address' in r.text, r.text)
old = tx(48_000_000, blockMs=int(time.time() * 1000) - 300_000)  # 5 minutes before bob opened his order
settle(1.5)
r = bob.post(f'{B}/api/orders/{bo[2]["id"]}/txid', json={'txid': old['txid']}, headers=O)
check('transaction older than the order refused', r.status_code == 422 and 'before' in r.text, r.text)

short = tx(5_000_000, inIndex=False)  # sent by an exchange, index slow: the claim waits
r = bob.post(f'{B}/api/orders/{bo[2]["id"]}/txid', json={'txid': short['txid']}, headers=O).json()
check('claim of a tx the index has not listed yet -> confirming', r['status'] == 'confirming', r)
requests.post(f'{T}/_set', json={'txid': short['txid'], 'set': {'inIndex': True}})
st = wait(bob, bo[2]['id'], 'partially_paid')
check('then 5 USDT for a 48 USDT plan -> partially paid (owner decides)', st['status'] == 'partially_paid', st)

print('front-running a claim')
# alice opens a fresh order; bob tries to claim alice's exact payment before the watcher sees it
ao = order(alice, 'month1')
bob_o = order(bob, 'month1')
steal = tx(micro(ao['pay']['amount']), inIndex=False)
r = bob.post(f'{B}/api/orders/{bob_o["id"]}/txid', json={'txid': steal['txid']}, headers=O).json()
requests.post(f'{T}/_set', json={'txid': steal['txid'], 'set': {'inIndex': True}})
st = wait(alice, ao['id'], 'paid')
check('the exact amount wins: alice\'s order is paid', st['status'] == 'paid', st)
bst = bob.get(f'{B}/api/orders/{bob_o["id"]}').json()
check('bob\'s claim is dropped', bst['status'] == 'pending' and not bst['txid'], bst)

print('late, cancelled, unmatched')
lo = order(alice, 'month3')
c = db(); c.execute('UPDATE orders SET expires_ms = ? WHERE id = ?', (int(time.time() * 1000) - 60_000, lo['id'])); c.commit()
settle(1)
check('order past its window -> expired', alice.get(f'{B}/api/orders/{lo["id"]}').json()['status'] == 'expired')
tx(micro(lo['pay']['amount']))
st = wait(alice, lo['id'], 'paid')
check('exact payment after the window is still recognised', st['status'] == 'paid', st)
check('...with a note for the owner', 'after the payment window' in (db().execute('SELECT note FROM orders WHERE id = ?', (lo['id'],)).fetchone()[0] or ''))
co = order(bob, 'year1')
bob.post(f'{B}/api/orders/{co["id"]}/cancel', headers=O)
tx(micro(co['pay']['amount']))
st = wait(bob, co['id'], 'review')
check('payment of a cancelled order -> review, not paid', st['status'] == 'review', st)
lost = tx(13_370_000)
settle(1.5)

print('owner panel')
owner = login('owner', '/' + PANEL)
ov = owner.get(f'{A}/overview', params={'tz': -120}).json()
ck = ov['checkout']
check('setup shows the address and a recent check', ck['configured'] and ck['address'] == ADDR and ck['lastOkAt'] and time.time() * 1000 - ck['lastOkAt'] < 10_000, ck)
check('attention counts unmatched payments', ov['stats']['unmatched'] == 2 and ov['stats']['attention'] >= 4, ov['stats'])
tl = owner.get(f'{A}/transfers').json()
check('unmatched payments listed', tl['total'] == 2 and {x['amount'] for x in tl['items']} == {'13.37', '48.00'}, [x['amount'] for x in tl['items']])
ao2 = order(alice, 'month6')
r = owner.post(f'{A}/transfers/assign', json={'txid': lost['txid'], 'orderId': ao2['id'][:8].upper()}, headers=O)
check('owner assigns a payment by order number -> paid', r.status_code == 201 and r.json()['status'] == 'paid', r.text)
r = owner.post(f'{A}/transfers/assign', json={'txid': lost['txid'], 'orderId': ao2['id']}, headers=O)
check('cannot assign twice', r.status_code == 409)
r = owner.post(f'{A}/transfers/ignore', json={'txid': old['txid'], 'note': 'test'}, headers=O)
check('owner sets a payment aside', r.status_code == 201 and owner.get(f'{A}/transfers').json()['total'] == 0)
s = owner.get(f'{A}/orders', params={'q': h['txid']}).json()
check('search orders by txid', s['total'] == 1 and s['items'][0]['id'] == o['id'], s['total'])
s = owner.get(f'{A}/orders', params={'q': exact}).json()
check('search orders by exact amount', s['total'] >= 1 and s['items'][0]['expected'] == exact, s['total'])
r = owner.post(f'{A}/orders/recheck', json={'id': bo[2]['id']}, headers=O)
check('re-check on the blockchain', r.status_code == 201, r.text)
r = owner.post(f'{A}/orders/mark-paid', json={'id': bo[2]['id'], 'note': 'accepted short payment'}, headers=O)
check('owner accepts a short payment', r.status_code == 201 and r.json()['status'] == 'paid', r.text)
calls = requests.get(f'{T}/_calls').json()
check('blockchain read on both sources', calls['index'] > 3 and calls['node'] > 3, calls)

# bulk data: 400 orders + members straight into the DB, to test the panel at volume
d = db()
now = int(time.time() * 1000)
for i in range(400):
    uid = str(500000000000000000 + i)
    d.execute("INSERT OR IGNORE INTO users(id,username,display_name,avatar,banned,created_ms,last_login_ms) VALUES (?,?,?,NULL,0,?,?)", (uid, f'trader{i}', f'Trader {i}', now - i * 3600_000, now - i * 60_000))
    d.execute("INSERT INTO orders(id,user_id,plan,amount,pay_to,status,created_ms,expires_ms,updated_ms,decided_ms) VALUES (?,?,?,?,'',?,?,?,?,?)",
              (f'{i:024x}', uid, 'month1' if i % 3 else 'lifetime', '8.00' if i % 3 else '67.00', 'paid' if i % 4 else 'expired', now - i * 3600_000, now, now, now - i * 3600_000))
d.commit()
pg = owner.get(f'{A}/orders', params={'page': 3, 'size': 50}).json()
check('pagination: 50 per page, total > 400', len(pg['items']) == 50 and pg['total'] > 400 and pg['page'] == 3, (len(pg['items']), pg['total']))
s = owner.get(f'{A}/orders', params={'q': 'Trader 123'}).json()
check('search by member name', s['total'] >= 1 and all('123' in (x['userName'] or '') for x in s['items']), s['total'])
s = owner.get(f'{A}/orders', params={'q': '%'}).json()
check('LIKE wildcard escaped', s['total'] == 0, s['total'])
bad = owner.get(f'{A}/orders', params={'sort': 'id; DROP TABLE orders'})
check('injection in sort refused (400)', bad.status_code == 400)
csv = owner.get(f'{A}/orders.csv', params={'status': 'paid'})
check('CSV export with txid column', csv.status_code == 200 and csv.text.startswith('order,created,member') and ',txid,' in csv.text.split('\n')[0] and h['txid'] in csv.text, csv.status_code)
md = owner.get(f'{A}/members/333333333333333333').json()
check('member detail', md['user']['name'] == 'Alice' and md['spent'] == 8 + 8 + 24 + 48 and len(md['events']) > 3, md.get('spent'))

print('redeem keys')
g = owner.post(f'{A}/codes/generate', json={'plan': 'month1', 'count': 3, 'batch': 'giveaway-oct'}, headers=O).json()
check('3 keys generated', len(g['codes']) == 3 and all(re.fullmatch(r'RDM(-[A-Z2-9]{4}){4}', c) for c in g['codes']), g)
r = bob.post(f'{B}/api/account/redeem', json={'code': g['codes'][0].lower()}, headers=O)
check('bob redeems (case-insensitive)', r.status_code == 201 and r.json()['days'] == 30, r.text)
r = alice.post(f'{B}/api/account/redeem', json={'code': g['codes'][0]}, headers=O)
check('used key refused', r.status_code == 404, r.status_code)

print('sessions')
alice2 = login('alice', ua='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1')
ss = alice2.get(f'{B}/api/account/sessions').json()
check('sessions listed with devices', len(ss) >= 2 and 'Safari on iOS' in {x['device'] for x in ss}, ss)
alice2.post(f'{B}/api/account/sessions/revoke-others', headers=O)
check('other sessions signed out', alice.get(f'{B}/api/account').status_code == 401 and alice2.get(f'{B}/api/account').status_code == 200)

print('data at rest')
dump = '\n'.join(db().iterdump())
check('redeem keys not stored raw', not any(c in dump for c in g['codes']))
check('no user agent stored raw', 'AppleWebKit' not in dump)
check('no private key material anywhere', not re.search(r'private|seed|mnemonic', dump, re.I))

print('receiving address change is flagged')
subprocess.run(f'for p in $(pgrep -f "dist/main.js"); do kill $p; done', shell=True)
time.sleep(1)
env = dict(os.environ)
for line in open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'env.sh')):
    for kv in re.findall(r'(\w+)=("[^"]*"|\S+)', line):
        env[kv[0]] = kv[1].strip('"')
env['TRON_RECEIVING_ADDRESS'] = 'TDzmefMPWwAKD8MGPv4Hxherg5AjJR7AtP'
subprocess.Popen(['node', 'dist/main.js'], cwd=os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'backend'), env=env, stdout=open(f'{SP}/server2.log', 'w'), stderr=subprocess.STDOUT)
time.sleep(3)
owner = login('owner', '/' + PANEL)
ov = owner.get(f'{A}/overview').json()
check('address change dated in the panel', ov['checkout']['addressChangedAt'] and ov['checkout']['address'] == 'TDzmefMPWwAKD8MGPv4Hxherg5AjJR7AtP', ov['checkout'])
ev = owner.get(f'{A}/events', params={'kind': 'security'}).json()
check('address change logged as a security event', ev['total'] >= 1 and 'Receiving address changed' in ev['items'][0]['text'], ev['items'][:1])

print(f'\n{ok} passed, {fail} failed')
sys.exit(1 if fail else 0)
