import { classify, fileNameFromUrl, formatSize, safeName, urlExt } from './lib/media.js';
import { parsePlaylist, playlistContentType } from './lib/hls.js';
import { convert, isNotSpeech, looksLikeThumbs, parseCues } from './lib/subtitles.js';
import { getSubText, SubtitleError } from './lib/subfetch.js';
import { allowReferer } from './lib/net.js';
import { initI18n, langSelect, t } from './lib/i18n.js';
import { el, fieldLabel, isConvertibleFormat, modePicker, nameField, subsBlock } from './lib/ui.js';
import { dirOf, groupHls, groupSubs, stripQuery } from './lib/group.js';

const $ = (id) => document.getElementById(id);
let tab;
let pageTitle = '';

function toast(msg) {
  const tt = $('toast');
  tt.textContent = msg;
  tt.style.display = 'block';
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (tt.style.display = 'none'), 2600);
}

// Chạy bên trong trang (mọi frame): đọc thẻ <video>, <track> và các cue phụ đề đã nạp.
function scanPage() {
  const fmt = (t) => {
    const ms = Math.round(t * 1000);
    const p = (n, w = 2) => String(n).padStart(w, '0');
    return `${p(Math.floor(ms / 3600000))}:${p(Math.floor((ms % 3600000) / 60000))}:${p(Math.floor((ms % 60000) / 1000))}.${p(ms % 1000, 3)}`;
  };
  const media = [];
  // Trình duyệt tự ghi lại mọi file trang đã tải → thấy phụ đề cả khi extension chưa kịp theo dõi
  // (vừa cài/cập nhật, service worker đang ngủ, lấy từ cache…).
  const seen = [];
  try {
    for (const e of performance.getEntriesByType('resource')) {
      if (/\.(vtt|webvtt|srt|ass|ssa|ttml|dfxp)(?=$|[?#])/i.test(e.name)) seen.push({ url: e.name, time: performance.timeOrigin + e.startTime });
    }
  } catch {}
  let pending = false; // còn phụ đề đang nạp dở
  // Nhiều trình phát (Mux, Vidstack…) đặt <video> trong shadow DOM.
  const players = [];
  const walk = (root) => {
    players.push(...root.querySelectorAll('video, audio'));
    for (const e of root.querySelectorAll('*')) {
      let sr = e.shadowRoot;
      try {
        sr = sr || (e instanceof HTMLElement ? chrome.dom.openOrClosedShadowRoot(e) : null);
      } catch {}
      if (sr) walk(sr);
    }
  };
  walk(document);
  for (const v of players) {
    const srcs = [v.currentSrc, v.src, ...[...v.querySelectorAll('source')].map((s) => s.src)];
    for (const s of srcs) if (s) media.push({ src: s, tag: v.tagName.toLowerCase(), w: v.videoWidth || 0, h: v.videoHeight || 0 });
  }
  const tracks = [];
  const notSubs = []; // <track> ảnh xem trước / chương
  for (const v of players) {
    for (const t of v.querySelectorAll('track')) {
      if (t.src && !['subtitles', 'captions'].includes(t.kind)) notSubs.push(t.src);
      else if (t.src) tracks.push({ src: t.src, label: t.label, lang: t.srclang, kind: t.kind });
    }
    for (const tt of v.textTracks) {
      if (!['subtitles', 'captions'].includes(tt.kind)) continue;
      // Bật "hidden" để trình duyệt nạp cue mà không thay đổi hiển thị.
      if (tt.mode === 'disabled') tt.mode = 'hidden';
      if (!tt.cues || !tt.cues.length) {
        pending = true;
        continue;
      }
      let out = 'WEBVTT\n\n';
      let n = 0;
      let end = 0;
      for (const c of tt.cues) {
        if (typeof c.text !== 'string') continue;
        if (c.endTime > end) end = c.endTime;
        out += `${fmt(c.startTime)} --> ${fmt(c.endTime)}\n${c.text}\n\n`;
        n++;
      }
      if (n) tracks.push({ vtt: out, label: tt.label, lang: tt.language, kind: tt.kind, count: n, partial: isFinite(v.duration) && v.duration > 0 && end < v.duration * 0.8 });
    }
  }
  return {
    top: window === window.top,
    title: document.title,
    url: location.href,
    drm: document.documentElement.getAttribute('data-vd-drm'),
    media,
    tracks,
    notSubs,
    seen: seen.slice(-200),
    pending,
  };
}

async function scanFrames() {
  try {
    const target = { tabId: tab.id, allFrames: true };
    const [iso, main] = await Promise.all([
      chrome.scripting.executeScript({ target, func: scanPage }),
      chrome.scripting.executeScript({ target, world: 'MAIN', func: () => (window.__vd ? window.__vd.status() : null) }).catch(() => []),
    ]);
    const byFrame = new Map(main.map((r) => [r.frameId, r.result]));
    return iso.filter((r) => r.result).map((r) => ({ ...r.result, frameId: r.frameId, vd: byFrame.get(r.frameId) || null }));
  } catch {
    return [];
  }
}

// Gọi một hàm của bộ ghi MediaSource (inject.js) trong đúng frame.
async function vdCall(frameId, method, args = []) {
  const [r] = await chrome.scripting.executeScript({
    target: { tabId: tab.id, frameIds: [frameId] },
    world: 'MAIN',
    func: (m, a) => (window.__vd && window.__vd[m] ? window.__vd[m](...a) : null),
    args: [method, args],
  });
  return r?.result;
}

function download(url, filename) {
  return new Promise((resolve, reject) => {
    chrome.downloads.download({ url, filename, saveAs: false }, (id) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(id);
    });
  });
}

function downloadText(text, filename, mime) {
  return download(`data:${mime};charset=utf-8,` + encodeURIComponent(text), filename);
}

function copy(text) {
  navigator.clipboard.writeText(text).then(() => toast(t('copied')));
}

function cliCommand(url) {
  const ref = tab.url && /^https?:/.test(tab.url) ? ` --referer "${tab.url}"` : '';
  return `yt-dlp${ref} -o "${safeName(pageTitle)}.%(ext)s" "${url}"`;
}

function btn(label, onClick, primary) {
  const b = el('button', primary ? 'primary' : '', label);
  b.addEventListener('click', onClick);
  return b;
}

function card(container, { tag, name, meta, actions }) {
  const box = el('div', 'item');
  const n = el('div', 'name');
  const tg = el('span', 'tag', tag);
  n.append(tg, document.createTextNode(name));
  const m = el('div', 'meta', meta || '');
  const a = el('div', 'actions');
  a.append(...actions);
  box.append(n, m, a);
  container.append(box);
  return { el: box, meta: m, actions: a, tag: tg };
}

// Nội dung playlist đã bắt được trong trang (dùng cho URL blob:/data: mà extension không fetch lại được).
let inlineTexts = {};
// Mọi phụ đề tìm thấy trên trang: { label, lang, format, convertible, ext, url?, vtt? }
let pageSubs = [];

async function getText(url) {
  if (inlineTexts[url] !== undefined) return inlineTexts[url];
  await allowReferer(url, tab.url);
  return (await fetch(url, { credentials: 'include' })).text();
}

async function subText(s) {
  if (s.vtt !== undefined) return s.vtt;
  const opt = { inline: inlineTexts, tabId: tab.id, frameId: s.frameId, ref: tab.url };
  // Phụ đề HLS dạng nhiều đoạn → tải từng đoạn rồi nối lại (convert() lọc trùng cue).
  if (s.segs) {
    const text = (await Promise.all(s.segs.map((u) => getSubText(u, { ...opt, segment: true })))).join('\n\n');
    if (!text.includes('-->')) throw new SubtitleError('empty');
    return text;
  }
  return getSubText(s.url, { ...opt, anyText: !s.convertible });
}

const subErrText = (e) => (e instanceof SubtitleError ? t('sub_' + e.code, { d: e.detail }) : e?.message || String(e));

async function saveSubtitle(s, name, fmt) {
  const text = await subText(s);
  if (s.convertible || text.includes('-->')) {
    return downloadText(convert(text, fmt), `${name}.${fmt}`, fmt === 'srt' ? 'application/x-subrip' : 'text/vtt');
  }
  return downloadText(text, `${name}.${s.ext || 'txt'}`, 'text/plain');
}

// Phụ đề dạng văn bản (VTT/SRT) chuyển sang trang khác qua storage.session.
function portableSubs() {
  return pageSubs.filter((s) => s.convertible).map(({ label, lang, url, vtt, segs, frameId }) => ({ label, lang, url, vtt, segs, frameId }));
}

async function stash(data) {
  const key = 'pl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  await chrome.storage.session.set({ [key]: data });
  return key;
}

async function openHlsDownloader(url) {
  const key = await stash({ inline: inlineTexts, subs: portableSubs() });
  const p = new URLSearchParams({ src: url, ref: tab.url || '', title: pageTitle, key, tab: tab.id });
  chrome.tabs.create({ url: chrome.runtime.getURL('downloader.html') + '?' + p, index: tab.index + 1 });
}

// ---------- Hộp thoại tải: sửa tên file video / phụ đề ----------
// media: { url, ext, kind } hoặc null (chỉ tải phụ đề). subs: danh sách phụ đề hiển thị.
function openSaveDialog({ media, subs }) {
  const dlg = $('dlg');
  const body = $('dlgBody');
  body.textContent = '';
  $('dlgTitle').textContent = t('dlgTitle');
  const base = safeName(pageTitle);

  let vf = null;
  let mode = null;
  let block = null;
  if (media) {
    body.append(fieldLabel(t(media.kind === 'audio' ? 'fAudioName' : 'fVideoName')));
    vf = nameField(base, media.ext);
    body.append(vf.el);
  }
  if (subs.length) {
    block = subsBlock(subs, base);
    if (media) {
      mode = modePicker(['both', 'video'], (m) => block.el.classList.toggle('off', m === 'video'));
      body.append(mode.el);
      vf.input.addEventListener('input', () => block.picker.setBase(vf.value()));
    }
    body.append(block.el);
    if (media) body.append(el('div', 'hint', t('nameHint')));
  } else if (media) {
    body.append(el('div', 'hint', t('noSubsFound')));
  }

  const ok = $('dlgOk');
  const cancel = $('dlgCancel');
  const close = () => dlg.close();
  ok.onclick = async () => {
    const jobs = [];
    const names = [];
    if (media) {
      const fname = `${vf.value()}.${media.ext}`;
      names.push(fname);
      jobs.push(allowReferer(media.url, tab.url).then(() => download(media.url, fname)));
    }
    if (block && mode?.value() !== 'video') {
      const fmt = block.format();
      for (const { sub, name } of block.picker.selected()) {
        names.push(name);
        jobs.push(saveSubtitle(sub, name, fmt));
      }
    }
    if (!jobs.length) return toast(t('nothingSelected'));
    close();
    const res = await Promise.allSettled(jobs);
    const fail = res.find((r) => r.status === 'rejected');
    const okN = res.filter((r) => r.status === 'fulfilled').length;
    if (fail) toast(t('error', { msg: subErrText(fail.reason) }) + (okN ? ` · ${t('toastStartedN', { n: okN })}` : ''));
    else toast(okN === 1 ? t('toastStarted', { name: names[0] }) : t('toastStartedN', { n: okN }));
  };
  cancel.onclick = close;
  dlg.showModal();
  (vf?.input || body.querySelector('input[type=text]'))?.select();
}

// Playlist đã đọc (giữ qua các lần quét lại).
const plCache = new Map();
function parseHls(url) {
  if (!plCache.has(url)) {
    plCache.set(
      url,
      Promise.race([getText(url), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 6000))])
        .then((text) => parsePlaylist(text, /^https?:/.test(url) ? url : tab.url))
        .catch((e) => ({ error: e.message }))
    );
  }
  return plCache.get(url);
}

// Xem nội dung từng file .vtt/.srt để loại ảnh xem trước, chương… (kết quả giữ qua các lần quét).
const notSpeech = new Map();
const fetchedTexts = {};
function checkNotSpeech(s) {
  if (!s.url || !s.convertible) return false;
  const text = inlineTexts[s.url];
  if (text !== undefined) return isNotSpeech(parseCues(text));
  const k = stripQuery(s.url);
  if (!notSpeech.has(k)) {
    notSpeech.set(
      k,
      Promise.race([
        allowReferer(s.url, tab.url)
          .then(() => fetch(s.url, { credentials: 'include' }))
          .then(async (r) => {
            if (!r.ok) return looksLikeThumbs(s.url);
            const text = await r.text();
            const cues = parseCues(text);
            if (cues.length && !isNotSpeech(cues) && text.length < 2e6) fetchedTexts[s.url] = inlineTexts[s.url] = text; // dùng luôn khi tải, khỏi lo link hết hạn
            return isNotSpeech(cues);
          }),
        new Promise((res) => setTimeout(() => res(looksLikeThumbs(s.url)), 4000)),
      ]).catch(() => looksLikeThumbs(s.url))
    );
  }
  return notSpeech.get(k);
}

function fmtDur(sec) {
  if (!sec || !isFinite(sec)) return '';
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), x = sec % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0');
}

// Độ dài video của một master: ưu tiên playlist con player đã tải, nếu không thì đọc bản chất lượng thấp nhất.
async function masterDuration(g) {
  const cands = [...g.children, g.pl.variants[g.pl.variants.length - 1]?.url].filter(Boolean);
  for (const u of cands) {
    const pl = await parseHls(u);
    if (pl && !pl.error && !pl.isMaster && pl.duration) return pl.duration;
  }
  return 0;
}

function hlsCard(container, g) {
  const pl = g.pl;
  const ui = card(container, {
    tag: 'HLS',
    name: fileNameFromUrl(g.url),
    meta: '',
    actions: [btn(t('download'), () => openHlsDownloader(g.url), true), btn(t('copyYtdlp'), () => copy(cliCommand(g.url)))],
  });
  if (!pl || pl.error) {
    ui.meta.textContent = t('plReadFail', { msg: pl?.error || '?' });
    return ui;
  }
  if (pl.isMaster) {
    const best = pl.variants[0];
    const subs = pl.media.filter((m) => m.TYPE === 'SUBTITLES' && m.URI).length;
    const audios = pl.media.filter((m) => m.TYPE === 'AUDIO' && m.URI).length;
    ui.tag.textContent = 'HLS master';
    const base =
      t('hlsQualities', { n: pl.variants.length }) +
      (best?.resolution ? t('hlsBest', { r: best.resolution }) : '') +
      (audios ? t('hlsAudios', { n: audios }) : '') +
      (subs ? t('hlsSubs', { n: subs }) : '');
    ui.meta.textContent = base;
    masterDuration(g).then((d) => d && (ui.meta.textContent = `⏱ ${fmtDur(d)} · ` + base + (pl.encrypted ? t('encryptedTag', { e: pl.encrypted }) : '')));
  } else {
    const kind = playlistContentType(pl);
    ui.tag.textContent = kind === 'vtt' ? t('hlsSubTag') : 'HLS';
    ui.meta.textContent = `⏱ ${fmtDur(pl.duration)} · ` + t('hlsMedia', { n: pl.segments.length, m: Math.round(pl.duration / 60), type: kind.toUpperCase() }) + (pl.endList ? '' : ' · LIVE');
  }
  if (pl.encrypted) {
    ui.meta.textContent += t('encryptedTag', { e: pl.encrypted });
    ui.actions.querySelector('button.primary')?.setAttribute('disabled', '');
  }
  return ui;
}

// Khối "xem thêm" thu gọn.
const moreOpen = {};
function moreBox(container, label, id) {
  const d = el('details', 'more');
  d.open = !!moreOpen[id];
  d.addEventListener('toggle', () => (moreOpen[id] = d.open));
  d.append(el('summary', '', label));
  const body = el('div');
  d.append(body);
  container.append(d);
  return body;
}

const injectedFrames = new Set();

function note(text, cls) {
  const d = el('div', cls, text);
  d.style.margin = '6px 0';
  $('videos').prepend(d);
}

// Nếu người dùng giới hạn "Truy cập trang web" (Khi nhấp / Trên trang cụ thể),
// script không tự chạy khi trang tải → không ghi được từ đầu.
async function checkSiteAccess() {
  document.getElementById('accessWarn')?.remove();
  let origin;
  try {
    origin = new URL(tab.url).origin;
  } catch {
    return;
  }
  if (!/^https?:/.test(origin)) return;
  const ok = await chrome.permissions.contains({ origins: [origin + '/*'] }).catch(() => true);
  const all = await chrome.permissions.contains({ origins: ['<all_urls>'] }).catch(() => true);
  if (ok && all) return;
  const w = el('div', 'warn');
  w.id = 'accessWarn';
  w.innerHTML = t('accessHtml');
  document.body.insertBefore(w, $('drm'));
}

let polls = [];
function stopPolls() {
  polls.forEach(clearInterval);
  polls = [];
}

function recorderCard(container, frameId, base) {
  const rate = el('select');
  for (const r of [1, 2, 4, 8, 16]) rate.append(new Option(`${r}×`, r));
  rate.value = '4';
  rate.title = t('rateTitle');
  const bStart = btn(t('recStart'), async () => {
    await vdCall(frameId, 'startRecording', [+rate.value, true]);
    refresh();
  }, true);
  const bStop = btn(t('recStop'), async () => {
    await vdCall(frameId, 'stopRecording');
    const st = await vdCall(frameId, 'status');
    if (!st?.sbs.some((s) => s.chunks)) return toast(t('noData'));
    // Lưu qua trang của extension (chrome.downloads) — tải trực tiếp trong iframe sandbox bị Chrome chặn.
    const key = await stash({ inline: inlineTexts, subs: portableSubs() });
    const q = new URLSearchParams({ tab: tab.id, frame: frameId, base, ref: tab.url || '', key });
    chrome.tabs.create({ url: chrome.runtime.getURL('saver.html') + '?' + q, index: tab.index + 1 });
  });
  const bClear = btn(t('recClear'), async () => {
    await vdCall(frameId, 'stopRecording');
    await vdCall(frameId, 'clear');
    refresh();
  });
  const ui = card(container, { tag: 'MSE', name: t('mseName'), meta: '…', actions: [rate, bStart, bStop, bClear] });
  ui.el.append(el('div', 'meta', t('mseHint')));

  async function refresh() {
    const st = await vdCall(frameId, 'status').catch(() => null);
    if (!st) return;
    const bytes = st.sbs.reduce((a, s) => a + s.bytes, 0);
    // Chỉ hiện buffer còn gắn với trình phát (player tạo lại MediaSource khi đổi video/chất lượng).
    const tracks = [...new Set(st.sbs.filter((s) => s.appends > 0 && (s.live !== false || s.chunks)).map((s) => s.mime.split(';')[0]))].join(' + ');
    const pct = st.video && st.video.d > 0 && isFinite(st.video.d) ? Math.round((st.video.t / st.video.d) * 100) : null;
    ui.meta.textContent =
      (st.recording ? t('recording') : '') +
      tracks +
      (bytes ? t('recorded', { s: formatSize(bytes) }) : '') +
      (pct !== null ? t('played', { p: pct }) : '') +
      (st.video?.ended && st.recording ? t('endedHint') : '');
    ui.tag.textContent = st.recording ? 'REC' : 'MSE';
    bStart.disabled = st.recording;
    bStop.disabled = !st.recording && !bytes;
    if (st.drm) ui.meta.textContent += t('drmRec');
    if (st.late && st.sbs.some((s) => s.appends && !s.hasInit)) ui.meta.textContent += t('lateInit');
  }
  refresh();
  polls.push(setInterval(refresh, 1000));
}

let renderId = 0;
let stillLoading = false;
async function render() {
  const myId = ++renderId;
  const [netItems, frames, nav] = await Promise.all([
    chrome.runtime.sendMessage({ type: 'getMedia', tabId: tab.id }),
    scanFrames(),
    chrome.runtime.sendMessage({ type: 'getNav', tabId: tab.id }).catch(() => ({})),
  ]);
  const cut = nav?.cut || 0;
  if (myId !== renderId) return; // đã có lần quét mới hơn
  const top = frames.find((f) => f.top);
  pageTitle = top?.title || tab.title || 'video';
  $('pageTitle').textContent = pageTitle;
  $('pageTitle').title = pageTitle;

  const drm = frames.map((f) => f.vd?.drm || f.drm).find(Boolean);
  $('drm').hidden = !drm;
  if (drm) $('drm').textContent = t('drmBanner', { drm });

  // Gộp item từ mạng và từ DOM (giữ thời điểm thấy gần nhất).
  const items = new Map();
  const put = (it) => {
    const old = items.get(it.url);
    if (!old) items.set(it.url, it);
    else {
      old.time = Math.max(old.time || 0, it.time || 0);
      if (old.frameId == null) old.frameId = it.frameId;
      if (!old.label) old.label = it.label;
      if (!old.lang) old.lang = it.lang;
    }
  };
  for (const it of netItems || []) put({ ...it });
  inlineTexts = { ...fetchedTexts };
  let blobVideos = 0;
  const now = Date.now();
  for (const f of frames) {
    // Playlist / phụ đề nhận ra nhờ soi nội dung (kể cả URL ngụy trang hoặc blob:)
    for (const fd of f.vd?.found || []) {
      if (fd.text !== undefined) inlineTexts[fd.url] = fd.text;
      if (fd.kind !== 'subtitle' && (fd.time || 0) < cut) continue; // video của trang trước (SPA)
      put({ kind: fd.kind, format: fd.format, url: fd.url, time: fd.time || 0, sniffed: true, frameId: f.frameId });
    }
    for (const r of f.seen || []) {
      const info = classify(r.url);
      if (info?.kind === 'subtitle') put({ ...info, url: r.url, time: r.time, frameId: f.frameId });
    }
    for (const m of f.media) {
      if (m.src.startsWith('blob:') || m.src.startsWith('mediasource:')) {
        blobVideos++;
        continue;
      }
      // Đang gắn vào thẻ <video> → coi là đang phát.
      const info = classify(m.src) || { kind: m.tag === 'audio' ? 'audio' : 'video', format: urlExt(m.src) || 'mp4' };
      put({ ...info, url: m.src, time: now, dims: m.w ? `${m.w}×${m.h}` : '' });
      const x = items.get(m.src);
      if (m.w) x.dims = `${m.w}×${m.h}`;
      x.time = now;
    }
    for (const tr of f.tracks) {
      if (tr.src) put({ kind: 'subtitle', format: urlExt(tr.src) || 'vtt', url: tr.src, label: tr.label, lang: tr.lang, time: now - 1, frameId: f.frameId });
    }
  }

  // ---- Video: lọc trùng, xếp theo hoạt động gần nhất ----
  const hlsItems = [...items.values()].filter((it) => it.kind === 'hls');
  const parsed = await Promise.all(hlsItems.map((it) => parseHls(it.url)));
  if (myId !== renderId) return;
  const hlsGroups = groupHls(hlsItems.map((it, i) => ({ url: it.url, time: it.time || 0, pl: parsed[i] })))
    // Playlist chỉ chứa phụ đề không phải là video.
    .filter((g) => !(g.pl && !g.pl.error && !g.pl.isMaster && playlistContentType(g.pl) === 'vtt'));
  const fileGroups = new Map();
  for (const it of items.values()) {
    if (!['video', 'audio', 'dash'].includes(it.kind)) continue;
    const k = stripQuery(it.url);
    const old = fileGroups.get(k);
    if (!old || (it.time || 0) >= (old.time || 0)) fileGroups.set(k, it);
  }
  const videos = [
    ...hlsGroups.map((g) => ({ type: 'hls', g, time: g.activity })),
    ...[...fileGroups.values()].map((it) => ({ type: it.kind === 'dash' ? 'dash' : 'file', it, time: it.time || 0 })),
  ].sort((a, b) => b.time - a.time);
  const main = videos[0];

  // ---- Phụ đề: 1 phụ đề / ngôn ngữ cho video đang phát, phần còn lại thu gọn ----
  const rawSubs = [];
  for (const it of items.values()) {
    if (it.kind !== 'subtitle') continue;
    const fmt = (it.format || '').toLowerCase();
    rawSubs.push({
      label: [it.label, it.lang].filter(Boolean).join(' · '),
      lang: it.lang || '',
      format: fmt,
      convertible: isConvertibleFormat(fmt),
      ext: fmt || 'txt',
      url: it.url,
      size: it.size,
      time: it.time || 0,
      frameId: it.frameId,
      stale: (it.time || 0) < cut,
    });
  }
  for (const f of frames) {
    for (const tr of f.tracks) {
      if (!tr.vtt) continue;
      rawSubs.push({
        label: [tr.label, tr.lang].filter(Boolean).join(' · ') || t('playerSubs'),
        lang: tr.lang || '',
        format: 'vtt',
        convertible: true,
        ext: 'vtt',
        vtt: tr.vtt,
        count: tr.count,
        partial: tr.partial,
        cues: true,
        time: now,
      });
    }
  }
  // Bỏ file .vtt không phải phụ đề (ảnh xem trước, chương). Đoạn HLS rất nhiều → chỉ kiểm tra vài file mỗi thư mục.
  const ignore = new Set(frames.flatMap((f) => f.notSubs || []).map(stripQuery));
  const perDir = new Map();
  const bad = await Promise.all(
    rawSubs.map((s) => {
      if (!s.url) return isNotSpeech(parseCues(s.vtt || ''));
      if (ignore.has(stripQuery(s.url))) return true;
      const d = dirOf(s.url);
      const n = (perDir.get(d) || 0) + 1;
      perDir.set(d, n);
      return n <= 6 || inlineTexts[s.url] !== undefined ? checkNotSpeech(s) : false;
    })
  );
  if (myId !== renderId) return;
  for (let i = rawSubs.length - 1; i >= 0; i--) if (bad[i]) rawSubs.splice(i, 1);
  const mainHlsHasSubs = main?.type === 'hls' && main.g.pl?.isMaster && main.g.pl.media.some((m) => m.TYPE === 'SUBTITLES' && m.URI);
  const sg = groupSubs(rawSubs, { dropSegments: mainHlsHasSubs });
  for (const s of [...sg.primary, ...sg.others]) {
    if (!s.seg) continue;
    s.label = (s.lang ? s.lang + ' · ' : '') + t('segParts', { n: s.segs.length });
    Object.assign(s, { convertible: true, ext: 'vtt' });
  }
  const primarySubs = sg.primary;
  const otherSubs = sg.others;
  pageSubs = primarySubs;
  for (const s of [...primarySubs, ...otherSubs]) if (!s.label) s.label = s.url ? fileNameFromUrl(s.url) : t('subtitle');

  // ---- Vẽ ----
  $('videos').textContent = '';
  $('subs').textContent = '';
  const base = safeName(pageTitle);

  const videoCard = (container, v) => {
    if (v.type === 'hls') return hlsCard(container, v.g);
    const it = v.it;
    if (v.type === 'dash') return card(container, { tag: 'DASH', name: fileNameFromUrl(it.url), meta: t('dashMeta'), actions: [btn(t('copyYtdlp'), () => copy(cliCommand(it.url)), true)] });
    const ext = it.format && it.format.length <= 4 ? it.format : 'mp4';
    return card(container, {
      tag: it.format || it.kind,
      name: fileNameFromUrl(it.url),
      meta: [it.kind === 'audio' ? t('audio') : t('video'), formatSize(it.size), it.dims].filter(Boolean).join(' · '),
      actions: [
        btn(t('download'), () => openSaveDialog({ media: { url: it.url, ext, kind: it.kind }, subs: pageSubs }), true),
        btn(t('copyYtdlp'), () => copy(cliCommand(it.url))),
      ],
    });
  };

  if (main) {
    const ui = videoCard($('videos'), main);
    if (videos.length > 1) {
      ui.el.classList.add('current');
      ui.el.prepend(el('div', 'badge', t('nowPlaying')));
    }
  }

  // Bộ ghi MediaSource: phương án dự phòng khi không bắt được playlist / file.
  stopPolls();
  let needRerender = false;
  let nVideo = videos.length;
  for (const f of frames) {
    const active = f.vd?.sbs?.filter((s) => s.appends > 0) || [];
    const hasBlob = f.media.some((m) => /^(blob|mediasource):/.test(m.src));
    if (active.length) {
      recorderCard($('videos'), f.frameId, base);
      nVideo++;
    } else if (hasBlob && !f.vd) {
      if (!injectedFrames.has(f.frameId)) {
        // Script chưa chạy trong frame này → chèn ngay rồi quét lại.
        injectedFrames.add(f.frameId);
        await chrome.scripting
          .executeScript({ target: { tabId: tab.id, frameIds: [f.frameId] }, world: 'MAIN', files: ['inject.js'] })
          .catch((e) => console.warn('inject', e));
        needRerender = true;
        note(t('attaching'), 'muted');
      } else {
        note(t('attachFail', { url: f.url.slice(0, 80) }), 'warn');
      }
      nVideo++;
    } else if (hasBlob && f.vd) {
      note(f.vd.drm ? t('mseDrm') : t('mseNoData'), f.vd.drm ? 'warn' : 'muted');
      nVideo++;
    }
  }

  if (videos.length > 1) {
    const box = moreBox($('videos'), t('otherVideos', { n: videos.length - 1 }), 'videos');
    for (const v of videos.slice(1)) videoCard(box, v);
  }

  // Thẻ phụ đề: mỗi phụ đề mở hộp thoại riêng (sửa tên, chọn định dạng).
  const subCard = (container, s) =>
    card(container, {
      tag: s.cues ? 'cues' : s.seg ? 'HLS' : s.format || 'sub',
      name: s.label,
      meta: s.cues
        ? t('cuesMeta', { n: s.count })
        : s.seg
          ? ''
          : [s.label !== fileNameFromUrl(s.url) ? fileNameFromUrl(s.url) : '', formatSize(s.size)].filter(Boolean).join(' · '),
      actions: [btn(t('download'), () => openSaveDialog({ media: null, subs: [s] }), true)],
    });
  if (mainHlsHasSubs) $('subs').append(el('div', 'hint', t('hlsSubsHint')));
  for (const s of primarySubs) subCard($('subs'), s);
  if (otherSubs.length) {
    const box = moreBox($('subs'), t('otherSubs', { n: otherSubs.length }), 'subs');
    for (const s of otherSubs) subCard(box, s);
  }

  stillLoading = frames.some((f) => f.pending);
  if (needRerender) setTimeout(render, 700);

  $('videoSec').hidden = !nVideo && !blobVideos;
  $('subSec').hidden = !primarySubs.length && !otherSubs.length && !mainHlsHasSubs;
  $('empty').hidden = !!(nVideo || primarySubs.length || otherSubs.length || blobVideos);
}

(async () => {
  await initI18n();
  $('tools').prepend(
    langSelect(() => {
      if ($('dlg').open) $('dlg').close();
      checkSiteAccess();
      render();
    })
  );
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  $('rescan').addEventListener('click', render);
  checkSiteAccess();
  await render();
  // Lần quét thứ 2: các textTrack vừa được bật "hidden" sẽ có cue.
  setTimeout(async () => {
    await render();
    // Mạng chậm: phụ đề còn đang nạp → quét thêm vài lần thay vì bắt người dùng tải lại trang.
    for (const wait of [1500, 3000]) {
      if (!stillLoading) break;
      await new Promise((r) => setTimeout(r, wait));
      if (!$('dlg').open) await render();
    }
  }, 900);
})();
