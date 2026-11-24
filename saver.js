import { pullTrack } from './lib/transfer.js';
import { formatSize, safeName } from './lib/media.js';
import { convert } from './lib/subtitles.js';
import { getSubText, SubtitleError } from './lib/subfetch.js';
import { initI18n, t } from './lib/i18n.js';
import { el, fieldLabel, modePicker, nameField, subsBlock } from './lib/ui.js';

const $ = (id) => document.getElementById(id);
const p = new URLSearchParams(location.search);
const tabId = +p.get('tab');
const frameId = +p.get('frame');
const REF = p.get('ref') || '';
const BASE = safeName(p.get('base') || 'video');

function log(msg, cls) {
  $('log').append(el('div', cls, msg));
}

async function call(method, args = []) {
  const [r] = await chrome.scripting.executeScript({
    target: { tabId, frameIds: [frameId] },
    world: 'MAIN',
    func: (m, a) => (window.__vd && window.__vd[m] ? window.__vd[m](...a) : null),
    args: [method, args],
  });
  return r?.result;
}

function save(blob, filename) {
  const url = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    chrome.downloads.download({ url, filename, saveAs: false }, (id) => {
      setTimeout(() => URL.revokeObjectURL(url), 10 * 60 * 1000);
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(id);
    });
  });
}

// Đoán phần mở rộng giống inject.js (chỉ để hiển thị trước khi lưu).
function extOf(mime) {
  const type = mime.split(';')[0].trim();
  return /webm/.test(type) ? 'webm' : type === 'audio/mp4' ? 'm4a' : type === 'audio/mpeg' ? 'mp3' : /mp2t/.test(type) ? 'ts' : 'mp4';
}

async function loadStash() {
  const key = p.get('key');
  if (!key) return { inline: {}, subs: [] };
  const r = await chrome.storage.session.get(key);
  chrome.storage.session.remove(key);
  return { inline: r[key]?.inline || {}, subs: r[key]?.subs || [] };
}

async function subText(s, inline) {
  if (s.vtt !== undefined) return s.vtt;
  const opt = { inline, tabId, frameId: s.frameId ?? frameId, ref: REF };
  if (!s.segs) return getSubText(s.url, opt);
  const text = (await Promise.all(s.segs.map((u) => getSubText(u, { ...opt, segment: true })))).join('\n\n');
  if (!text.includes('-->')) throw new SubtitleError('empty');
  return text;
}

(async () => {
  await initI18n();
  document.title = t('saverTitle');
  $('title').textContent = BASE;
  try {
    const st = await call('status');
    if (!st) throw new Error(t('noRecorder'));
    const tracks = st.sbs.filter((s) => s.chunks > 0);
    if (!tracks.length) throw new Error(t('nothingRec'));
    const { inline, subs } = await loadStash();

    // ---- Form đặt tên ----
    const names = $('names');
    const kinds = {};
    const fields = tracks.map((s) => {
      const type = s.mime.split(';')[0];
      const kind = type.startsWith('audio') ? 'audio' : 'video';
      kinds[kind] = (kinds[kind] || 0) + 1;
      const suffix = tracks.length === 1 ? '' : '.' + kind + (kinds[kind] > 1 ? '-' + kinds[kind] : '');
      names.append(fieldLabel(t('trackName', { mime: type, size: formatSize(s.bytes) })));
      const f = nameField(BASE + suffix, extOf(s.mime));
      names.append(f.el);
      const r = { s, f, suffix, touched: false };
      f.input.addEventListener('input', () => (r.touched = true));
      return r;
    });
    // Đổi tên luồng video chính → các tên còn lại (chưa sửa tay) đổi theo.
    const lead = fields.find((r) => r.suffix === '' || r.suffix === '.video') || fields[0];
    const leadBase = () => {
      const v = lead.f.value();
      return lead.suffix && v.endsWith(lead.suffix) ? v.slice(0, -lead.suffix.length) : v;
    };
    let block = null;
    let mode = null;
    if (subs.length) {
      block = subsBlock(
        subs.map((s) => ({ ...s, convertible: true })),
        BASE
      );
      mode = modePicker(['both', 'video'], (m) => block.el.classList.toggle('off', m === 'video'));
      $('modeBox').append(mode.el);
      $('subsBox').append(block.el, el('div', 'hint', t('nameHint')));
    }
    lead.f.input.addEventListener('input', () => {
      const b = leadBase();
      for (const r of fields) if (r !== lead && !r.touched) r.f.input.value = b + r.suffix;
      block?.picker.setBase(b);
    });
    $('form').hidden = false;
    $('status').textContent = '';
    lead.f.input.select();

    await new Promise((resolve) => ($('save').onclick = resolve));
    $('save').disabled = true;
    $('form').classList.add('off');

    // ---- Chuyển & lưu ----
    const total = tracks.reduce((a, s) => a + s.bytes, 0);
    let before = 0;
    const files = [];
    for (const { s, f } of fields) {
      log(t('transferring', { mime: s.mime.split(';')[0], size: formatSize(s.bytes) }));
      const res = await pullTrack(call, s.id, (done) => {
        $('bar').style.width = Math.round(((before + done) / total) * 100) + '%';
        $('status').textContent = `${formatSize(before + done)} / ${formatSize(total)}`;
      });
      before += s.bytes;
      if (!res) continue;
      const name = `${f.value()}.${res.info.ext}`;
      await save(res.blob, name);
      files.push({ name, kind: res.info.kind });
      log(t('savedTo', { name, size: formatSize(res.blob.size) }), 'ok');
      if (!res.info.hasInit) log(t('noInit'), 'err');
    }
    if (block && mode.value() !== 'video') {
      const fmt = block.format();
      for (const { sub, name } of block.picker.selected()) {
        try {
          const out = convert(await subText(sub, inline), fmt);
          await save(new Blob([out], { type: fmt === 'srt' ? 'application/x-subrip' : 'text/vtt' }), `${name}.${fmt}`);
          log(t('savedTo', { name: `${name}.${fmt}`, size: formatSize(out.length) }), 'ok');
        } catch (e) {
          log(t('subErr', { msg: e instanceof SubtitleError ? t('sub_' + e.code, { d: e.detail }) : e.message }), 'err');
        }
      }
    }
    $('bar').style.width = '100%';
    $('status').textContent = t('done');
    const v = files.find((x) => x.kind === 'video');
    const a = files.find((x) => x.kind === 'audio');
    if (v && a && files.length === 2) {
      log(t('ffmpegMerge'));
      log(`cd ~/Downloads && ffmpeg -i "${v.name}" -i "${a.name}" -c copy "${leadBase()}.mp4"`);
    }
  } catch (e) {
    log('✖ ' + e.message, 'err');
    $('status').textContent = t('errStatus');
  }
})();
