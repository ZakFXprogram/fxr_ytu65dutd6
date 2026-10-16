// Local stand-in for Discord OAuth2, for testing the sign-in flow only.
const http = require('http');
const { URL } = require('url');
const users = {
  owner:     { id: '111111111111111111', username: 'zak_owner', global_name: 'Zak (owner)', avatar: null, mfa_enabled: true },
  ownernomfa:{ id: '222222222222222222', username: 'zak_alt', global_name: 'Zak alt', avatar: null, mfa_enabled: false },
  alice:     { id: '333333333333333333', username: 'alice', global_name: 'Alice', avatar: null, mfa_enabled: false },
  bob:       { id: '444444444444444444', username: 'bob', global_name: 'Bob', avatar: null, mfa_enabled: false },
};
let persona = 'alice';
const codes = new Map(); // code -> persona
const tokens = new Map(); // token -> persona
let revoked = 0;
const inGuild = new Set(['111111111111111111', '333333333333333333']); // owner + alice are in the server
const roles = new Set();
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost:9999');
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    if (u.pathname.startsWith('/_as/')) { persona = u.pathname.slice(5); res.end('ok ' + persona); return; }
    if (u.pathname === '/_stats') { res.end(JSON.stringify({ revoked, roles: [...roles] })); return; }
    const m = u.pathname.match(/^\/api\/guilds\/(\d+)\/members\/(\d+)\/roles\/(\d+)$/);
    if (m) {
      if (req.headers.authorization !== 'Bot test-bot-token' || m[1] !== '900000000000000001' || m[3] !== '900000000000000002') { res.writeHead(401); res.end('{}'); return; }
      if (!inGuild.has(m[2])) { res.writeHead(404, { 'content-type': 'application/json' }); res.end('{"code":10007,"message":"Unknown Member"}'); return; }
      if (req.method === 'PUT') roles.add(m[2]); else if (req.method === 'DELETE') roles.delete(m[2]);
      res.writeHead(204); res.end(); return;
    }
    if (u.pathname === '/oauth2/authorize') {
      const ok = u.searchParams.get('client_id') === 'testclient' && u.searchParams.get('scope') === 'identify';
      const code = 'code-' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      codes.set(code, persona);
      const back = new URL(u.searchParams.get('redirect_uri'));
      if (ok) back.searchParams.set('code', code); else back.searchParams.set('error', 'invalid_request');
      back.searchParams.set('state', u.searchParams.get('state'));
      res.writeHead(302, { Location: back.toString() }); res.end(); return;
    }
    if (u.pathname === '/api/oauth2/token' && req.method === 'POST') {
      const f = new URLSearchParams(body);
      const p = codes.get(f.get('code'));
      if (!p || f.get('client_secret') !== 'testsecret' || f.get('client_id') !== 'testclient' || f.get('grant_type') !== 'authorization_code') {
        res.writeHead(400, { 'content-type': 'application/json' }); res.end('{"error":"invalid_grant"}'); return;
      }
      codes.delete(f.get('code'));
      const t = 'tok-' + Math.random().toString(36).slice(2);
      tokens.set(t, p);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ access_token: t, token_type: 'Bearer', expires_in: 604800, scope: 'identify' })); return;
    }
    if (u.pathname === '/api/oauth2/token/revoke') { revoked++; tokens.delete(new URLSearchParams(body).get('token')); res.end('{}'); return; }
    if (u.pathname === '/api/users/@me') {
      const t = (req.headers.authorization || '').replace('Bearer ', '');
      const p = tokens.get(t);
      if (!p) { res.writeHead(401); res.end('{}'); return; }
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(users[p])); return;
    }
    res.writeHead(404); res.end();
  });
}).listen(9999, () => console.log('mock discord on 9999'));
