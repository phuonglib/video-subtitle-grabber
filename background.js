// Service worker: lắng nghe request mạng của từng tab, ghi lại các URL video / playlist / phụ đề.
import { classify } from './lib/media.js';
import { navCut } from './lib/nav.js';

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

// Lúc trình duyệt thật sự tải một trang mới trong tab (khác với SPA chỉ đổi URL).
const mainAt = new Map();
chrome.webRequest.onBeforeRequest.addListener(
  (d) => {
    if (d.tabId >= 0) mainAt.set(d.tabId, Date.now());
  },
  { urls: ['<all_urls>'], types: ['main_frame'] }
);

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
  if (info.url) onNavigate(tabId, info.url).catch(() => {});
});
const navKey = (tabId) => 'nav_' + tabId;
const getNav = async (tabId) => (await chrome.storage.session.get(navKey(tabId)))[navKey(tabId)] || {};
async function onNavigate(tabId, url) {
  const nav = await getNav(tabId);
  const full = mainAt.get(tabId) || 0;
  mainAt.delete(tabId);
  const now = Date.now();
  const cut = navCut({ oldUrl: nav.url, newUrl: url, now, mainAt: full });
  await chrome.storage.session.set({ [navKey(tabId)]: { url, cut: cut || nav.cut || 0 } });
  if (!cut) return; // chỉ đổi query/hash → giữ nguyên
  const items = await getTab(tabId);
  // Tải trang mới: bỏ mục của trang cũ. SPA: giữ lại, popup xếp xuống mục "khác" (trang cuộn kiểu feed tải trước video kế tiếp).
  for (const [u, it] of Object.entries(items)) {
    if (it.time < cut && full) delete items[u];
  }
  persist(tabId);
}
chrome.tabs.onRemoved.addListener((tabId) => {
  mem.delete(tabId);
  mainAt.delete(tabId);
  chrome.storage.session.remove([key(tabId), navKey(tabId)]).catch(() => {});
});

// ---- Tải file: thử trình tải của Chrome; máy chủ từ chối (thiếu Referer…) → trang filesave.html tự tải ----
const DL = 'dl_';
async function downloadMedia({ url, filename, ref, index }) {
  const id = await chrome.downloads.download({ url, filename, saveAs: false });
  await chrome.storage.session.set({ [DL + id]: { url, filename, ref, index } });
  const [d] = await chrome.downloads.search({ id }); // có thể đã hỏng trước khi kịp lưu
  if (d?.state === 'interrupted') await fallback(id, d.error);
  return id;
}
async function fallback(id, error) {
  const k = DL + id;
  const job = (await chrome.storage.session.get(k))[k];
  if (!job) return;
  await chrome.storage.session.remove(k);
  if (!/^SERVER_|^NETWORK_FAILED|^FILE_FAILED/.test(error || '')) return; // người dùng hủy, hết đĩa…
  chrome.downloads.erase({ id }).catch(() => {});
  const q = new URLSearchParams({ src: job.url, name: job.filename, ref: job.ref || '' });
  chrome.tabs.create({ url: chrome.runtime.getURL('filesave.html') + '?' + q, index: job.index });
}
chrome.downloads.onChanged.addListener((d) => {
  if (d.state?.current === 'interrupted') fallback(d.id, d.error?.current);
  else if (d.state?.current === 'complete') chrome.storage.session.remove(DL + d.id).catch(() => {});
});

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type === 'downloadMedia') {
    downloadMedia(msg).then((id) => reply({ id }), (e) => reply({ error: e.message }));
    return true;
  }
  if (msg?.type === 'getMedia') {
    getTab(msg.tabId).then((items) => reply(Object.values(items).sort((a, b) => a.time - b.time)));
    return true;
  }
  if (msg?.type === 'getNav') {
    getNav(msg.tabId).then(reply);
    return true;
  }
  if (msg?.type === 'clearMedia') {
    clearTab(msg.tabId).then(() => reply(true));
    return true;
  }
});
