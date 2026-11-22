// Nhiều CDN chỉ trả video khi request có đúng header như player gửi (Referer, Origin, token…).
// background.js ghi lại header thật của player theo host (storage.session 'hdr_<host>');
// ở đây tạo rule declarativeNetRequest để request của extension tới host đó gửi y hệt.

function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const applied = new Map(); // host -> chuỗi header đã áp dụng

export async function getRecordedHeaders(host) {
  try {
    const r = await chrome.storage.session.get('hdr_' + host);
    return r['hdr_' + host]?.headers || null;
  } catch {
    return null;
  }
}

export async function allowReferer(mediaUrl, pageUrl) {
  let host;
  try {
    host = new URL(mediaUrl).hostname;
  } catch {
    return;
  }
  if (!host) return;

  const recorded = await getRecordedHeaders(host);
  const headers = recorded ? { ...recorded } : {};
  if (!recorded && pageUrl && /^https?:/.test(pageUrl)) headers.referer = pageUrl;
  if (!Object.keys(headers).length) return;

  const sig = JSON.stringify(headers);
  if (applied.get(host) === sig) return;
  applied.set(host, sig);

  const id = (hash(host) % 900000) + 1;
  const toRule = (hs) => ({
    type: 'modifyHeaders',
    requestHeaders: Object.entries(hs).map(([header, value]) => ({ header, operation: 'set', value })),
  });
  const rules = (action) => [
    // fetch() từ trang của extension (popup, downloader)
    { id, priority: 1, action, condition: { requestDomains: [host], initiatorDomains: [chrome.runtime.id] } },
    // chrome.downloads (không thuộc tab nào)
    { id: id + 1000000, priority: 1, action, condition: { requestDomains: [host], tabIds: [-1] } },
  ];
  try {
    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [id, id + 1000000], addRules: rules(toRule(headers)) });
  } catch (e) {
    // Một số header có thể bị từ chối → thử lại chỉ với Referer/Origin.
    console.warn('DNR full headers failed, fallback', e);
    const basic = {};
    for (const k of ['referer', 'origin']) if (headers[k]) basic[k] = headers[k];
    if (!Object.keys(basic).length) return;
    try {
      await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [id, id + 1000000], addRules: rules(toRule(basic)) });
    } catch (e2) {
      console.warn('DNR rule failed', e2);
    }
  }
}

export class HttpError extends Error {
  constructor(status, url) {
    super(`HTTP ${status}`);
    this.status = status;
    this.url = url;
  }
}

export async function fetchWithRetry(url, { range, signal, as = 'arrayBuffer', tries = 4 } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const headers = range ? { Range: `bytes=${range[0]}-${range[1]}` } : undefined;
      const r = await fetch(url, { headers, signal, credentials: 'include' });
      if (!r.ok) throw new HttpError(r.status, url);
      return await r[as]();
    } catch (e) {
      if (signal?.aborted) throw e;
      lastErr = e;
      // Lỗi 4xx (trừ 408/429) thường không tự hết → không thử lại vô ích.
      if (e instanceof HttpError && e.status >= 400 && e.status < 500 && e.status !== 408 && e.status !== 429) break;
      await new Promise((res) => setTimeout(res, 500 * 2 ** i));
    }
  }
  throw lastErr;
}
