// Service worker: lắng nghe request mạng của từng tab, ghi lại các URL video / playlist / phụ đề.
import { classify } from './lib/media.js';

const MAX_ITEMS = 200;
const mem = new Map(); // tabId -> { [url]: item }
const loading = new Map();
const key = (tabId) => 'tab_' + tabId;

function getTab(tabId) {
  if (mem.has(tabId)) return Promise.resolve(mem.get(tabId));
  if (!loading.has(tabId)) {
    loading.set(
      tabId,
      chrome.storage.session.get(key(tabId)).then((r) => {
        if (!mem.has(tabId)) mem.set(tabId, r[key(tabId)] || {});
        loading.delete(tabId);
        return mem.get(tabId);
      })
    );
  }
  return loading.get(tabId);
}

function persist(tabId) {
  chrome.storage.session.set({ [key(tabId)]: mem.get(tabId) || {} }).catch(() => {});
  const n = Object.keys(mem.get(tabId) || {}).length;
  chrome.action.setBadgeText({ tabId, text: n ? String(n) : '' }).catch(() => {});
  chrome.action.setBadgeBackgroundColor({ tabId, color: '#2563eb' }).catch(() => {});
}

async function addItem(tabId, item) {
  const items = await getTab(tabId);
  const old = items[item.url];
  if (old) {
    if (item.size > (old.size || 0)) old.size = item.size;
    old.time = item.time;
  } else {
    const urls = Object.keys(items);
    if (urls.length >= MAX_ITEMS) delete items[urls[0]];
    items[item.url] = item;
  }
  persist(tabId);
}

async function clearTab(tabId) {
  mem.set(tabId, {});
  persist(tabId);
}

chrome.webRequest.onHeadersReceived.addListener(
  (d) => {
    if (d.initiator && d.initiator.startsWith('chrome-extension://')) return;
    if (d.statusCode >= 400) return;
    const h = {};
    for (const x of d.responseHeaders || []) h[x.name.toLowerCase()] = x.value;
    const info = classify(d.url, h['content-type'], h);
    if (!info) return;
    const item = { ...info, url: d.url, time: Date.now() };
    if (d.tabId >= 0) return void addItem(d.tabId, item);
    // Request từ Service Worker của trang: không có tabId → gán cho các tab cùng origin.
    if (!d.initiator) return;
    chrome.tabs.query({}).then((tabs) => {
      for (const t of tabs) {
        try {
          if (t.url && new URL(t.url).origin === d.initiator) addItem(t.id, item);
        } catch {}
      }
    });
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders']
);

// Ghi lại header mà player thực sự gửi (Referer, Origin, Authorization, X-…) theo từng host,
// để trang tải của extension gửi y hệt — nhiều CDN trả 400/403 nếu thiếu.
const SKIP_HEADERS = new Set([
  'cookie', 'host', 'connection', 'content-length', 'accept-encoding', 'user-agent', 'range',
  'accept', 'accept-language', 'cache-control', 'pragma', 'priority', 'if-range', 'if-none-match',
  'if-modified-since', 'upgrade-insecure-requests', 'dnt',
]);
const lastHeaders = new Map();
chrome.webRequest.onSendHeaders.addListener(
  (d) => {
    if (d.initiator && d.initiator.startsWith('chrome-extension://')) return;
    let host;
    try {
      host = new URL(d.url).hostname;
    } catch {
      return;
    }
    const keep = {};
    for (const h of d.requestHeaders || []) {
      const n = h.name.toLowerCase();
      if (SKIP_HEADERS.has(n) || n.startsWith('sec-')) continue;
      keep[n] = h.value;
    }
    const json = JSON.stringify(keep);
    if (lastHeaders.get(host) === json) return;
    lastHeaders.set(host, json);
    chrome.storage.session.set({ ['hdr_' + host]: { headers: keep, time: Date.now() } }).catch(() => {});
  },
  { urls: ['<all_urls>'], types: ['xmlhttprequest', 'media', 'other'] },
  ['requestHeaders', 'extraHeaders']
);

chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === 'loading' && info.url) clearTab(tabId);
});
chrome.tabs.onRemoved.addListener((tabId) => {
  mem.delete(tabId);
  chrome.storage.session.remove(key(tabId)).catch(() => {});
});

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type === 'getMedia') {
    getTab(msg.tabId).then((items) => reply(Object.values(items).sort((a, b) => a.time - b.time)));
    return true;
  }
  if (msg?.type === 'clearMedia') {
    clearTab(msg.tabId).then(() => reply(true));
    return true;
  }
});
