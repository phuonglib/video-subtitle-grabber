// Tải file video bằng chính extension (kèm Referer/cookie như trình phát) khi trình tải của Chrome bị máy chủ từ chối.
import { allowReferer, HttpError } from './lib/net.js';
import { formatSize } from './lib/media.js';
import { initI18n, t } from './lib/i18n.js';

const $ = (id) => document.getElementById(id);
const p = new URLSearchParams(location.search);
const url = p.get('src');
const name = p.get('name') || 'video.mp4';
const STEP = 8 * 1024 * 1024;
const ctl = new AbortController();

async function part(start) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url, { credentials: 'include', signal: ctl.signal, headers: { Range: `bytes=${start}-${start + STEP - 1}` } });
      if (!r.ok) throw new HttpError(r.status, url);
      const type = (r.headers.get('content-type') || '').split(';')[0];
      if (/^text\/html/.test(type)) throw new Error(t('notVideo'));
      const buf = await r.arrayBuffer();
      const total = r.status === 206 ? +(r.headers.get('content-range') || '').match(/\/(\d+)/)?.[1] || 0 : buf.byteLength;
      return { buf, total, type, whole: r.status === 200 };
    } catch (e) {
      if (ctl.signal.aborted || i >= 3 || (e instanceof HttpError && e.status < 500 && e.status !== 429)) throw e;
      await new Promise((r) => setTimeout(r, 800 * 2 ** i));
    }
  }
}

(async () => {
  await initI18n();
  document.title = name;
  $('title').textContent = name;
  $('stop').onclick = () => ctl.abort();
  try {
    await allowReferer(url, p.get('ref') || '');
    const parts = [];
    let got = 0, total = 0, type = 'video/mp4';
    do {
      const r = await part(got);
      parts.push(new Blob([r.buf])); // Blob lớn được Chrome chuyển ra đĩa
      got += r.buf.byteLength;
      total = r.total || total;
      type = r.type || type;
      if (r.whole || !r.buf.byteLength) break;
      $('bar').style.width = total ? Math.round((got / total) * 100) + '%' : '50%';
      $('status').textContent = `${formatSize(got)}${total ? ' / ' + formatSize(total) : ''}`;
    } while (!total || got < total);
    if (total && got !== total) throw new Error(t('missingData', { got, want: total }));
    const blobUrl = URL.createObjectURL(new Blob(parts, { type }));
    await new Promise((res, rej) =>
      chrome.downloads.download({ url: blobUrl, filename: name, saveAs: false }, () => (chrome.runtime.lastError ? rej(new Error(chrome.runtime.lastError.message)) : res()))
    );
    $('bar').style.width = '100%';
    $('status').textContent = t('done');
    $('log').textContent = t('savedTo', { name, size: formatSize(got) });
  } catch (e) {
    $('status').textContent = ctl.signal.aborted ? t('stoppedLog') : t('error', { msg: e.message });
  }
  $('stop').disabled = true;
})();
