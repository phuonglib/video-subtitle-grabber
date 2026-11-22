// Các thành phần giao diện dùng chung cho hộp thoại tải: ô tên file, chọn chế độ, danh sách phụ đề.
import { t } from './i18n.js';
import { safeName } from './media.js';

export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

// Ô nhập tên file (không gồm phần mở rộng) + nhãn phần mở rộng phía sau.
export function nameField(value, ext) {
  const wrap = el('div', 'namefield');
  const input = el('input');
  input.type = 'text';
  input.value = value;
  input.spellcheck = false;
  const suf = el('span', 'ext');
  wrap.append(input, suf);
  const f = {
    el: wrap,
    input,
    setExt(e) {
      suf.textContent = e ? '.' + e : '';
      suf.hidden = !e;
    },
    value: () => safeName(input.value),
  };
  f.setExt(ext);
  return f;
}

export function fieldLabel(text) {
  return el('div', 'flabel', text);
}

// Chọn chế độ tải: 'both' | 'video' | 'subs'. Mặc định là mục đầu tiên.
export function modePicker(modes, onChange) {
  const wrap = el('div', 'modes');
  const name = 'mode' + Math.random().toString(36).slice(2, 7);
  const label = { both: t('modeBoth'), video: t('modeVideo'), subs: t('modeSubs') };
  modes.forEach((m, i) => {
    const l = el('label');
    const r = el('input');
    r.type = 'radio';
    r.name = name;
    r.value = m;
    r.checked = i === 0;
    r.addEventListener('change', () => onChange?.(m));
    l.append(r, document.createTextNode(label[m]));
    wrap.append(l);
  });
  return {
    el: wrap,
    value: () => wrap.querySelector('input:checked')?.value || modes[0],
  };
}

// Hậu tố tên phụ đề: ".en", ".vi"… (thêm số nếu trùng) để trình phát tự nhận theo tên video.
function suffixFor(lang, used) {
  const key = lang ? safeName(lang).replace(/\s+/g, '_') : '';
  const n = (used.get(key) || 0) + 1;
  used.set(key, n);
  return (key ? '.' + key : '') + (n > 1 ? '.' + n : '');
}

// subs: [{ label, lang, convertible, ext }]. Tất cả được chọn sẵn.
export function subsPicker(subs, base, fmt) {
  const list = el('div', 'sublist');
  const used = new Map();
  const rows = subs.map((sub) => {
    const row = el('div', 'subrow');
    const head = el('label', 'subhead');
    const cb = el('input');
    cb.type = 'checkbox';
    cb.checked = true;
    head.append(cb, document.createTextNode(sub.label || t('subtitle')));
    const suffix = suffixFor(sub.lang, used);
    const f = nameField(base + suffix, sub.convertible ? fmt : sub.ext);
    const r = { sub, cb, f, suffix, touched: false };
    f.input.addEventListener('input', () => (r.touched = true));
    cb.addEventListener('change', () => {
      f.input.disabled = !cb.checked;
      row.classList.toggle('off', !cb.checked);
    });
    row.append(head, f.el);
    list.append(row);
    return r;
  });
  return {
    el: list,
    // Đổi tên video → đổi theo tên các phụ đề người dùng chưa sửa tay.
    setBase(b) {
      for (const r of rows) if (!r.touched) r.f.input.value = b + r.suffix;
    },
    setFormat(f) {
      for (const r of rows) if (r.sub.convertible) r.f.setExt(f);
    },
    selected: () => rows.filter((r) => r.cb.checked).map((r) => ({ sub: r.sub, name: r.f.value() })),
    hasConvertible: subs.some((s) => s.convertible),
  };
}

export function formatSelect(onChange) {
  const sel = el('select');
  sel.append(new Option('SRT', 'srt'), new Option('WebVTT', 'vtt'));
  sel.addEventListener('change', () => onChange?.(sel.value));
  return sel;
}

// Khối phụ đề đầy đủ: tiêu đề, danh sách, định dạng. Trả về picker + phần tử.
export function subsBlock(subs, base) {
  const box = el('div', 'subsbox');
  box.append(fieldLabel(t('fSubName')));
  const picker = subsPicker(subs, base, 'srt');
  box.append(picker.el);
  let fmtSel = null;
  if (picker.hasConvertible) {
    const row = el('div', 'frow');
    fmtSel = formatSelect((v) => picker.setFormat(v));
    row.append(el('span', 'muted', t('subFormat')), fmtSel);
    box.append(row);
  }
  return { el: box, picker, format: () => fmtSel?.value || 'srt' };
}

// Danh sách phụ đề trang → định dạng dùng được ở trang khác (truyền qua storage.session).
export function isConvertibleFormat(f) {
  return ['vtt', 'srt', 'webvtt', ''].includes((f || '').toLowerCase());
}
