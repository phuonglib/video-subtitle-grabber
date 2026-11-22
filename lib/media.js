// Phân loại một response mạng xem có phải media / phụ đề không.

const VIDEO_EXT = ['mp4', 'webm', 'm4v', 'mov', 'mkv', 'flv', 'ogv', '3gp'];
const AUDIO_EXT = ['mp3', 'm4a', 'ogg', 'opus', 'wav', 'flac'];
const SUB_EXT = { vtt: 'vtt', webvtt: 'vtt', srt: 'srt', ass: 'ass', ssa: 'ass', ttml: 'ttml', dfxp: 'ttml' };
const SUB_CT = {
  'text/vtt': 'vtt',
  'application/x-subrip': 'srt',
  'text/srt': 'srt',
  'application/ttml+xml': 'ttml',
  'text/x-ssa': 'ass',
};
// Các mảnh (segment) của luồng — không liệt kê riêng lẻ.
const SEGMENT_EXT = ['ts', 'm4s', 'm4f', 'aac', 'key', 'cmfv', 'cmfa'];

export function totalSize(h = {}) {
  const cr = h['content-range'];
  if (cr) {
    const m = cr.match(/\/(\d+)\s*$/);
    if (m) return +m[1];
  }
  return +h['content-length'] || 0;
}

export function urlExt(url) {
  try {
    const p = new URL(url).pathname.toLowerCase();
    return (p.match(/\.([a-z0-9]{2,6})$/) || [])[1] || '';
  } catch {
    return '';
  }
}

export function classify(url, contentType = '', headers = {}) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;

  const ext = urlExt(url);
  const ct = (contentType || '').split(';')[0].trim().toLowerCase();
  const size = totalSize(headers);

  if (ext === 'm3u8' || ct.includes('mpegurl')) return { kind: 'hls', format: 'm3u8', size };
  if (ext === 'mpd' || ct === 'application/dash+xml') return { kind: 'dash', format: 'mpd', size };
  if (SUB_EXT[ext]) return { kind: 'subtitle', format: SUB_EXT[ext], size };
  if (SUB_CT[ct]) return { kind: 'subtitle', format: SUB_CT[ct], size };

  if (SEGMENT_EXT.includes(ext) || ct === 'video/mp2t' || ct === 'video/iso.segment') return null;

  if (ct.startsWith('video/') || VIDEO_EXT.includes(ext)) {
    if (size && size < 300 * 1024) return null; // nhiều khả năng là segment hoặc clip preview
    return { kind: 'video', format: VIDEO_EXT.includes(ext) ? ext : ct.split('/')[1] || 'mp4', size };
  }
  if (ct.startsWith('audio/') || AUDIO_EXT.includes(ext)) {
    if (size && size < 200 * 1024) return null;
    return { kind: 'audio', format: AUDIO_EXT.includes(ext) ? ext : ct.split('/')[1] || 'mp3', size };
  }
  return null;
}

export function fileNameFromUrl(url) {
  try {
    const seg = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || '');
    return seg || new URL(url).hostname;
  } catch {
    return url;
  }
}

export function formatSize(n) {
  if (!n) return '';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i ? 1 : 0)} ${u[i]}`;
}

export function safeName(s) {
  return (
    (s || '')
      .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^\.+/, '')
      .slice(0, 120) || 'video'
  );
}
