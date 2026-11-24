// Lấy nội dung phụ đề một cách bền bỉ, theo thứ tự:
//  1. bản đã bắt được khi player tải (không phụ thuộc token còn hạn hay không)
//  2. extension tự tải (kèm Referer/header của player)
//  3. tải ngay bên trong trang (dùng cookie + origin của trang) — trước hết ở frame trình phát
// Trang lỗi, trang đăng nhập hay file rỗng không bao giờ được coi là phụ đề.
import { allowReferer, HttpError } from './net.js';
import { isNotSpeech, parseCues } from './subtitles.js';

export class SubtitleError extends Error {
  constructor(code, detail = '') {
    super(code);
    this.code = code; // 'expired' | 'empty' | 'network'
    this.detail = detail;
  }
}

/** Có phải nội dung phụ đề dùng được không. anyText: định dạng khác VTT/SRT (ass, ttml) — chỉ loại HTML/rỗng. */
export function usable(text, { anyText = false, segment = false } = {}) {
  if (typeof text !== 'string') return false;
  const s = text.replace(/^﻿/, '').trimStart();
  if (!s || /^<(!doctype|html|head|body)/i.test(s)) return false;
  if (s.startsWith('#EXTM3U')) return true;
  if (segment && s.startsWith('WEBVTT')) return !isNotSpeech(parseCues(s)); // đoạn HLS có thể không có câu thoại nào
  if (anyText) return !/^(\{|\[\s*[{"\]])/.test(s); // JSON lỗi
  const cues = parseCues(s);
  return cues.length > 0 && !isNotSpeech(cues);
}

async function fromExtension(url, ref, signal) {
  await allowReferer(url, ref);
  const r = await fetch(url, { credentials: 'include', signal });
  if (!r.ok) throw new HttpError(r.status, url);
  return r.text();
}

// Chạy trong trang.
async function pageFetch(url) {
  for (const credentials of ['same-origin', 'include']) {
    try {
      const r = await fetch(url, { credentials });
      if (r.ok) return await r.text();
    } catch {}
  }
  return null;
}

async function fromPage(url, tabId, frameId) {
  const tryIn = async (target) => {
    try {
      const res = await chrome.scripting.executeScript({ target, func: pageFetch, args: [url] });
      return res.map((r) => r.result).filter((x) => typeof x === 'string');
    } catch {
      return [];
    }
  };
  if (frameId != null) {
    const a = await tryIn({ tabId, frameIds: [frameId] });
    if (a.length) return a;
  }
  return tryIn({ tabId, allFrames: true });
}

export async function getSubText(url, { inline = {}, tabId, frameId, ref = '', anyText = false, segment = false, signal } = {}) {
  const ok = (x) => usable(x, { anyText, segment });
  if (ok(inline[url])) return inline[url];
  let last = null;
  let got = false; // đã nhận được nội dung nhưng không phải phụ đề
  if (/^https?:/.test(url)) {
    for (let i = 0; i < 2; i++) {
      try {
        const x = await fromExtension(url, ref, signal);
        if (ok(x)) return x;
        got = true;
        break;
      } catch (e) {
        if (signal?.aborted) throw e;
        last = e;
        if (e instanceof HttpError && e.status < 500 && e.status !== 429) break;
        if (i === 0) await new Promise((r) => setTimeout(r, 600));
      }
    }
  }
  if (tabId != null && /^(https?|blob):/.test(url)) {
    for (const x of await fromPage(url, tabId, frameId)) {
      if (ok(x)) return x;
      got = true;
    }
  }
  if (last instanceof HttpError) throw new SubtitleError('expired', `HTTP ${last.status}`);
  if (got) throw new SubtitleError('empty');
  throw new SubtitleError('network', last?.message || '');
}
