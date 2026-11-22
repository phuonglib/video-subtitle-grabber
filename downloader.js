import { parsePlaylist, playlistContentType, describeVariant } from './lib/hls.js';
import { allowReferer, fetchWithRetry, getRecordedHeaders } from './lib/net.js';
import { convert } from './lib/subtitles.js';
import { safeName, formatSize } from './lib/media.js';
import { initI18n, t } from './lib/i18n.js';
import { el, fieldLabel, modePicker, nameField, subsBlock } from './lib/ui.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const SRC = params.get('src');
const REF = params.get('ref') || '';
const TITLE = params.get('title') || 'video';
const BASE = safeName(TITLE);
const CONCURRENCY = 6;

let master = null; // playlist gốc
let controller = null;
let ui = {}; // ô tên file, chế độ, phụ đề

function log(msg, cls) {
  const line = el('div', cls, msg);
  $('log').append(line);
  $('log').scrollTop = $('log').scrollHeight;
}
const status = (msg) => ($('status').textContent = msg);
const progress = (frac) => ($('bar').style.width = Math.min(100, Math.round(frac * 100)) + '%');
function warn(msg) {
  $('warn').hidden = false;
  $('warn').textContent = msg;
}

async function prepareHosts(urls) {
  const hosts = new Map();
  for (const u of urls) {
    try {
      const h = new URL(u).hostname;
      if (!hosts.has(h)) hosts.set(h, u);
    } catch {}
  }
  await Promise.all([...hosts.values()].map((u) => allowReferer(u, REF)));
}

// Dữ liệu popup truyền qua storage.session: nội dung playlist blob: và phụ đề của trang.
let inline = {};
let pageSubs = [];
async function loadInline() {
  const key = params.get('key');
  if (!key) return;
  const r = await chrome.storage.session.get(key);
  const d = r[key] || {};
  // Tương thích bản cũ (chỉ lưu inline).
  if (d.inline || d.subs) {
    inline = d.inline || {};
    pageSubs = d.subs || [];
  } else inline = d;
  chrome.storage.session.remove(key);
}

async function getText(url, signal) {
  if (inline[url] !== undefined) return inline[url];
  if (!/^https?:/.test(url)) throw new Error(t('blobPlErr'));
  await allowReferer(url, REF);
  return fetchWithRetry(url, { as: 'text', signal });
}

async function loadPlaylist(url) {
  const text = await getText(url, controller?.signal);
  return { text, pl: parsePlaylist(text, /^https?:/.test(url) ? url : REF) };
}

async function fetchSegments(pl, label, signal) {
  const jobs = [];
  if (pl.map) jobs.push({ url: pl.map.url, range: pl.map.range });
  for (const s of pl.segments) jobs.push({ url: s.url, range: s.range });
  await prepareHosts(jobs.map((j) => j.url));

  const out = new Array(jobs.length);
  let next = 0, done = 0, bytes = 0;
  const t0 = Date.now();
  async function worker() {
    while (next < jobs.length) {
      const i = next++;
      out[i] = await fetchWithRetry(jobs[i].url, { range: jobs[i].range, signal });
      done++;
      bytes += out[i].byteLength;
      progress(done / jobs.length);
      const speed = bytes / Math.max(1, (Date.now() - t0) / 1000);
      status(t('progressLine', { label, d: done, n: jobs.length, size: formatSize(bytes), speed: formatSize(speed) }));
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker));
  return out;
}

function save(blob, filename) {
  const url = URL.createObjectURL(blob);
  return new Promise((resolve) => {
    chrome.downloads.download({ url, filename, saveAs: false }, (id) => {
      if (chrome.runtime.lastError) log(t('saveErr', { msg: chrome.runtime.lastError.message }), 'err');
      else log(t('saved', { name: filename, size: formatSize(blob.size) }), 'ok');
      // Giữ blob URL một lúc cho Chrome đọc xong.
      setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
      resolve(id);
    });
  });
}

async function downloadStream(url, label, isAudio, name, signal) {
  log(t('readPl', { label }));
  const { pl } = await loadPlaylist(url);
  if (pl.isMaster) throw new Error(t('nested'));
  if (pl.encrypted) throw new Error(t('encErr', { e: pl.encrypted }));
  if (!pl.endList) log(t('liveWarn'));
  const type = playlistContentType(pl);
  log(t('segInfo', { n: pl.segments.length, m: Math.round(pl.duration / 60), type: type.toUpperCase() }));
  const firstUrl = (pl.map || pl.segments[0])?.url;
  if (firstUrl) {
    let host = '';
    try {
      host = new URL(firstUrl).hostname;
    } catch {}
    const rec = host ? await getRecordedHeaders(host) : null;
    log(rec ? t('hostRec', { host, h: Object.keys(rec).join(', ') || t('none') }) : t('hostNoRec', { host: host || '?' }));
  }
  const parts = await fetchSegments(pl, label, signal);
  const ext = type === 'mp4' ? (isAudio ? 'm4a' : 'mp4') : type;
  const mime = { mp4: 'video/mp4', m4a: 'audio/mp4', ts: 'video/mp2t', aac: 'audio/aac' }[ext] || 'application/octet-stream';
  const filename = `${name}.${ext}`;
  await save(new Blob(parts, { type: mime }), filename);
  return filename;
}

async function downloadSubtitle(media, fmt, name, signal) {
  log(t('subLog', { name: [media.NAME, media.LANGUAGE].filter(Boolean).join(' · ') || name }));
  let vttText;
  if (media.vtt !== undefined) {
    vttText = media.vtt;
  } else if (media.segs) {
    await prepareHosts(media.segs);
    vttText = (await Promise.all(media.segs.map((u) => (inline[u] !== undefined ? inline[u] : fetchWithRetry(u, { as: 'text', signal }))))).join('\n\n');
  } else {
    const first = await getText(media.URI, signal);
    if (first.trimStart().startsWith('#EXTM3U')) {
      const pl = parsePlaylist(first, /^https?:/.test(media.URI) ? media.URI : REF);
      await prepareHosts(pl.segments.map((s) => s.url));
      const texts = [];
      let next = 0;
      const worker = async () => {
        while (next < pl.segments.length) {
          const i = next++;
          texts[i] = await fetchWithRetry(pl.segments[i].url, { as: 'text', range: pl.segments[i].range, signal });
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pl.segments.length) }, worker));
      vttText = texts.join('\n\n');
    } else {
      vttText = first;
    }
  }
  const out = convert(vttText, fmt);
  await save(new Blob([out], { type: fmt === 'srt' ? 'application/x-subrip' : 'text/vtt' }), `${name}.${fmt}`);
}

function fillAudio() {
  const v = master.variants[$('variant').selectedIndex];
  const group = v?.audio;
  const audios = master.media.filter((m) => m.TYPE === 'AUDIO' && m.URI && (!group || m['GROUP-ID'] === group));
  const sel = $('audio');
  sel.textContent = '';
  if (!audios.length) {
    $('audioRow').hidden = true;
    updateAudioName();
    return;
  }
  $('audioRow').hidden = false;
  sel.append(new Option(t('noSepAudio'), ''));
  audios.forEach((a) => {
    const o = new Option([a.NAME, a.LANGUAGE, a.DEFAULT === 'YES' ? t('isDefault') : ''].filter(Boolean).join(' · '), a.URI);
    if (a.DEFAULT === 'YES') o.selected = true;
    sel.append(o);
  });
  if (!sel.value && audios.length) sel.selectedIndex = 1;
  updateAudioName();
}

function updateAudioName() {
  if (ui.audioWrap) ui.audioWrap.hidden = $('audioRow').hidden || !$('audio').value;
}

// Ô tên file video / audio + chọn chế độ + danh sách phụ đề (đặt tên sẵn theo video).
function buildNameForm(hasVideo, subs) {
  const names = $('names');
  names.textContent = '';
  if (hasVideo) {
    names.append(fieldLabel(t('fVideoName')));
    ui.video = nameField(BASE, '');
    names.append(ui.video.el, el('div', 'hint', t('extAuto')));
    ui.audioWrap = el('div');
    ui.audio = nameField(BASE + '.audio', '');
    let audioTouched = false;
    ui.audio.input.addEventListener('input', () => (audioTouched = true));
    ui.audioWrap.append(fieldLabel(t('fAudioName')), ui.audio.el);
    names.append(ui.audioWrap);
    ui.video.input.addEventListener('input', () => {
      if (!audioTouched) ui.audio.input.value = ui.video.value() + '.audio';
      ui.subs?.picker.setBase(ui.video.value());
    });
    updateAudioName();
  }
  if (subs.length) {
    ui.subs = subsBlock(
      subs.map((s) => ({ label: [s.NAME, s.LANGUAGE && !(s.NAME || '').toLowerCase().includes(s.LANGUAGE.toLowerCase()) ? s.LANGUAGE : '', s.FORCED === 'YES' ? 'forced' : ''].filter(Boolean).join(' · '), lang: s.LANGUAGE || '', convertible: true, media: s })),
      BASE
    );
    $('subsBox').append(ui.subs.el);
    if (hasVideo) {
      ui.mode = modePicker(['both', 'video', 'subs'], (m) => {
        ui.subs.el.classList.toggle('off', m === 'video');
        names.classList.toggle('off', m === 'subs');
        $('variantRow').classList.toggle('off', m === 'subs');
        $('audioRow').classList.toggle('off', m === 'subs');
      });
      $('modeBox').append(ui.mode.el);
      $('subsBox').append(el('div', 'hint', t('nameHint')));
    }
  }
}

async function init() {
  await initI18n();
  document.title = t('hlsTitle');
  $('title').textContent = TITLE;
  $('src').textContent = SRC;
  if (!SRC) return warn(t('missingSrc'));
  try {
    await loadInline();
    const { text, pl } = await loadPlaylist(SRC);
    if (!/^https?:/.test(SRC)) {
      const rel = text.split(/\r?\n/).some((l) => (l = l.trim()) && !l.startsWith('#') && !/^[a-z]+:/i.test(l));
      if (rel) warn(t('blobRelWarn'));
    }
    $('form').hidden = false;
    // Phụ đề lấy từ trang (popup) — dùng khi playlist không khai báo phụ đề.
    const fromPage = pageSubs.map((s) => ({ URI: s.url, NAME: s.label, LANGUAGE: s.lang, vtt: s.vtt, segs: s.segs }));
    if (pl.isMaster) {
      master = pl;
      pl.variants.forEach((v) => $('variant').append(new Option(describeVariant(v), v.url)));
      $('variant').addEventListener('change', fillAudio);
      const subs = pl.media.filter((m) => m.TYPE === 'SUBTITLES' && m.URI);
      master.subs = subs.length ? subs : fromPage;
      if (!pl.variants.length) $('variantRow').hidden = true;
      buildNameForm(pl.variants.length > 0, master.subs);
      fillAudio();
    } else {
      master = { variants: [{ url: SRC }], media: [], subs: fromPage };
      const type = playlistContentType(pl);
      $('variant').append(new Option(t('playlistThis', { n: pl.segments.length, type: type.toUpperCase() }), SRC));
      if (type === 'vtt') {
        // Bản thân playlist là phụ đề
        master.variants = [];
        master.subs = [{ URI: SRC, NAME: t('subsInPl') }];
        $('variantRow').hidden = true;
      }
      buildNameForm(master.variants.length > 0, master.subs);
      if (pl.encrypted) warn(t('encWarn', { e: pl.encrypted }));
    }
    log(t('ready'));
  } catch (e) {
    warn(t('plReadFail', { msg: e.message }));
  }
}

async function start() {
  const mode = ui.mode?.value() || 'both';
  const wantVideo = mode !== 'subs' && master.variants.length > 0;
  const subs = mode !== 'video' && ui.subs ? ui.subs.picker.selected() : [];
  if (!wantVideo && !subs.length) return log(t('nothingSelected'), 'err');

  controller = new AbortController();
  const { signal } = controller;
  $('start').disabled = true;
  $('stop').disabled = false;
  progress(0);
  const files = [];
  try {
    if (wantVideo) {
      files.push(await downloadStream($('variant').value, t('video'), false, ui.video.value(), signal));
      if (!$('audioRow').hidden && $('audio').value) {
        progress(0);
        files.push(await downloadStream($('audio').value, t('audio'), true, ui.audio.value(), signal));
      }
    }
    const fmt = ui.subs?.format() || 'srt';
    for (const { sub, name } of subs) {
      try {
        await downloadSubtitle(sub.media, fmt, name, signal);
      } catch (e) {
        if (signal.aborted) throw e;
        log(t('subErr', { msg: e.message }), 'err');
      }
    }
    progress(1);
    status(t('done'));
    const out = safeName(ui.video?.value() || BASE);
    if (files.length === 2) {
      log(t('mergeHint'));
      log(`cd ~/Downloads && ffmpeg -i "${files[0]}" -i "${files[1]}" -c copy "${out}.merged.mp4"`);
    } else if (files[0]?.endsWith('.ts')) {
      log(t('tsHint'));
      log(`cd ~/Downloads && ffmpeg -i "${files[0]}" -c copy "${out}.mp4"`);
    }
  } catch (e) {
    if (signal.aborted) log(t('stoppedLog'), 'err');
    else {
      log('✖ ' + e.message + (e.url ? t('whileFetching', { url: e.url.length > 160 ? e.url.slice(0, 160) + '…' : e.url }) : ''), 'err');
      if (e.status) log(t('hint400'));
    }
    status('');
  } finally {
    $('start').disabled = false;
    $('stop').disabled = true;
  }
}

$('start').addEventListener('click', start);
$('stop').addEventListener('click', () => controller?.abort());
$('audio').addEventListener('change', updateAudioName);
init();
