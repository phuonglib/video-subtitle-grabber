// Đọc / ghi phụ đề WebVTT và SRT.

export function parseTime(s) {
  const p = s.trim().replace(',', '.').split(':');
  let h = 0, m, sec;
  if (p.length === 3) [h, m, sec] = p;
  else [m, sec] = p;
  return +h * 3600 + +m * 60 + parseFloat(sec);
}

export function fmtTime(t, sep = '.') {
  const ms = Math.round(t * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const r = ms % 1000;
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(s)}${sep}${p(r, 3)}`;
}

// Nhận cả VTT lẫn SRT.
export function parseCues(text) {
  text = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const cues = [];
  for (const block of text.split(/\n{2,}/)) {
    const lines = block.split('\n');
    const i = lines.findIndex((l) => l.includes('-->'));
    if (i < 0) continue;
    const [a, rest] = lines[i].split('-->');
    const b = rest.trim().split(/\s+/)[0];
    const start = parseTime(a);
    const end = parseTime(b);
    if (Number.isNaN(start) || Number.isNaN(end)) continue;
    cues.push({ start, end, text: lines.slice(i + 1).join('\n').trim() });
  }
  return cues;
}

// File VTT không phải phụ đề: ảnh xem trước trên thanh thời gian (…jpg#xywh=…) hoặc dữ liệu JSON.
const NOT_SPEECH = /^\S+\.(jpe?g|png|webp|avif|gif)(\?\S*)?(#\S*)?$|^\S+#xywh=[\d.,a-z:]+$|^[{[][\s\S]*[}\]]$/i;
export function isNotSpeech(cues) {
  const c = cues.filter((x) => x.text);
  if (!c.length) return false;
  const bad = c.filter((x) => NOT_SPEECH.test(x.text) && !/^\[[^{"\]]*\]$/.test(x.text)).length; // [Music] là phụ đề
  return bad > c.length / 2;
}

// Tên file thường dùng cho ảnh xem trước / chương.
export function looksLikeThumbs(url = '') {
  let p = '';
  try {
    p = new URL(url).pathname.toLowerCase();
  } catch {}
  return /(thumb(nail)?s?|storyboards?|sprites?|mosaic|preview[-_]?(images?|thumbs?)|chapters?)[^/]*\.(vtt|webvtt)$/.test(p);
}

export function dedupe(cues) {
  const seen = new Set();
  return cues
    .filter((c) => c.text)
    .sort((x, y) => x.start - y.start || x.end - y.end)
    .filter((c) => {
      const k = `${c.start.toFixed(3)}|${c.end.toFixed(3)}|${c.text}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

function srtText(t) {
  // SRT chỉ hỗ trợ <i>, <b>, <u>; bỏ các thẻ riêng của VTT (<c.x>, <v Name>, <00:00:01.000>...)
  return t
    .replace(/<(?!\/?(?:i|b|u)>)[^>]*>/gi, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

export function toSrt(cues) {
  return cues.map((c, i) => `${i + 1}\n${fmtTime(c.start, ',')} --> ${fmtTime(c.end, ',')}\n${srtText(c.text)}\n`).join('\n');
}

export function toVtt(cues) {
  return 'WEBVTT\n\n' + cues.map((c) => `${fmtTime(c.start)} --> ${fmtTime(c.end)}\n${c.text}\n`).join('\n');
}

export function convert(text, target) {
  const cues = dedupe(parseCues(text));
  return target === 'srt' ? toSrt(cues) : toVtt(cues);
}
