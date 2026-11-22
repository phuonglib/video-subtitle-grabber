const store = { 'hdr_cdn.example.com': { headers: { origin: 'null', referer: 'https://player.x/embed', 'x-token': 'abc' } } };
let calls = [];
globalThis.chrome = { runtime: { id: 'extid' },
  storage: { session: { get: async k => ({ [k]: store[k] }) } },
  declarativeNetRequest: { updateSessionRules: async r => { calls.push(r); if (calls.length === 1 && process.env.FAIL) throw new Error('bad header'); } } };
const { allowReferer, fetchWithRetry, HttpError } = await import('../lib/net.js');
await allowReferer('https://cdn.example.com/seg1.m4s', 'https://site.vn/page');
console.log(JSON.stringify(calls[0].addRules[0].action.requestHeaders));
await allowReferer('https://other.com/a', 'https://site.vn/page');
console.log(JSON.stringify(calls[1].addRules[0].action.requestHeaders));
await allowReferer('https://other.com/a', 'https://site.vn/page'); console.log('memo ok:', calls.length === 2);
// 400 không retry
let n = 0; globalThis.fetch = async () => { n++; return { ok: false, status: 400 }; };
try { await fetchWithRetry('https://cdn/x'); } catch (e) { console.log(e.message, e.url, 'tries=', n); }
