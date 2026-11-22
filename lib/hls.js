import { t } from './i18n.js';
// Trình phân tích playlist HLS (.m3u8) tối giản.

export function parseAttrs(s) {
  const out = {};
  const re = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/g;
  let m;
  while ((m = re.exec(s))) out[m[1]] = m[2].replace(/^"|"$/g, '');
  return out;
}

function resolve(uri, base) {
  try {
    return new URL(uri, base).href;
  } catch {
    return uri;
  }
}

function parseRange(s, prevNext) {
  const [len, off] = s.split('@');
  const start = off !== undefined ? +off : prevNext;
  const end = start + +len - 1;
  return { range: [start, end], next: end + 1 };
}

export function parsePlaylist(text, baseUrl) {
  const lines = text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines[0] || !lines[0].startsWith('#EXTM3U')) throw new Error(t('notHls'));

  const res = {
    isMaster: false,
    variants: [],
    media: [],
    segments: [],
    map: null,
    encrypted: null,
    endList: false,
    duration: 0,
  };
  let pendingVariant = null;
  let seg = {};
  let byteNext = 0;

  for (const line of lines) {
    if (line.startsWith('#EXT-X-STREAM-INF:')) {
      res.isMaster = true;
      pendingVariant = parseAttrs(line.slice(18));
    } else if (line.startsWith('#EXT-X-MEDIA:')) {
      res.isMaster = true;
      const a = parseAttrs(line.slice(13));
      if (a.URI) a.URI = resolve(a.URI, baseUrl);
      res.media.push(a);
    } else if (line.startsWith('#EXT-X-KEY:') || line.startsWith('#EXT-X-SESSION-KEY:')) {
      const a = parseAttrs(line.slice(line.indexOf(':') + 1));
      if (a.METHOD && a.METHOD !== 'NONE') {
        res.encrypted = a.METHOD + (a.KEYFORMAT ? ` (${a.KEYFORMAT})` : '');
      }
    } else if (line.startsWith('#EXT-X-MAP:')) {
      if (!res.map) {
        const a = parseAttrs(line.slice(11));
        res.map = { url: resolve(a.URI, baseUrl), range: a.BYTERANGE ? parseRange(a.BYTERANGE, 0).range : null };
      }
    } else if (line.startsWith('#EXTINF:')) {
      seg.duration = parseFloat(line.slice(8)) || 0;
    } else if (line.startsWith('#EXT-X-BYTERANGE:')) {
      const r = parseRange(line.slice(17), byteNext);
      seg.range = r.range;
      byteNext = r.next;
    } else if (line.startsWith('#EXT-X-ENDLIST')) {
      res.endList = true;
    } else if (!line.startsWith('#')) {
      const url = resolve(line, baseUrl);
      if (pendingVariant) {
        res.variants.push({
          url,
          bandwidth: +pendingVariant.BANDWIDTH || +pendingVariant['AVERAGE-BANDWIDTH'] || 0,
          resolution: pendingVariant.RESOLUTION || '',
          codecs: pendingVariant.CODECS || '',
          audio: pendingVariant.AUDIO || null,
          subtitles: pendingVariant.SUBTITLES || null,
        });
        pendingVariant = null;
      } else {
        res.segments.push({ url, duration: seg.duration || 0, range: seg.range || null });
        res.duration += seg.duration || 0;
        if (!seg.range) byteNext = 0;
        seg = {};
      }
    }
  }
  res.variants.sort((a, b) => b.bandwidth - a.bandwidth);
  return res;
}

// Đoán loại nội dung của media playlist dựa trên segment.
export function playlistContentType(pl) {
  if (pl.map) return 'mp4';
  const first = pl.segments[0]?.url || '';
  let ext = '';
  try {
    ext = (new URL(first).pathname.toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || '';
  } catch {}
  if (ext === 'vtt' || ext === 'webvtt') return 'vtt';
  if (ext === 'aac') return 'aac';
  if (ext === 'mp4' || ext === 'm4s') return 'mp4';
  return 'ts';
}

export function describeVariant(v) {
  const parts = [];
  if (v.resolution) parts.push(v.resolution.split('x')[1] + 'p');
  if (v.bandwidth) parts.push((v.bandwidth / 1e6).toFixed(2) + ' Mbps');
  if (v.codecs) parts.push(v.codecs);
  return parts.join(' · ') || v.url;
}
