// Chạy trong MAIN world của trang, từ document_start.
// 1) Phát hiện DRM thật sự đang dùng (setMediaKeys) để cảnh báo — không can thiệp vào DRM.
// 2) Soi nội dung response fetch/XHR để nhận ra playlist HLS/DASH/phụ đề bị ngụy trang
//    (không có đuôi .m3u8, content-type sai, hoặc nạp từ blob:).
// 3) Ghi lại dữ liệu mà player nạp vào MediaSource (khi người dùng bật ghi).
(() => {
  if (window.__vd) return;
  // late = script được chèn sau khi trang đã chạy (popup tự chèn) → có thể đã lỡ init segment
  const S = (window.__vd = { drm: null, drmProbe: null, found: [], sbs: [], recording: false, late: document.readyState !== 'loading' });
  const MAX_FOUND = 100;
  const MAX_TEXT = 2 * 1024 * 1024;

  // ---------- 1. DRM ----------
  try {
    const nav = navigator;
    if (nav.requestMediaKeySystemAccess) {
      const orig = nav.requestMediaKeySystemAccess.bind(nav);
      nav.requestMediaKeySystemAccess = function (ks, cfg) {
        S.drmProbe = String(ks); // nhiều player chỉ "dò" khả năng, chưa chắc dùng DRM
        return orig(ks, cfg);
      };
    }
    const origSet = HTMLMediaElement.prototype.setMediaKeys;
    if (origSet) {
      HTMLMediaElement.prototype.setMediaKeys = function (mk) {
        if (mk) {
          S.drm = S.drmProbe || 'EME';
          try { document.documentElement.setAttribute('data-vd-drm', S.drm); } catch (_) {}
        }
        return origSet.call(this, mk);
      };
    }
  } catch (_) {}

  // ---------- 2. Soi nội dung response ----------
  function sniffText(head) {
    const t = head.replace(/^\uFEFF/, '').trimStart();
    if (t.startsWith('#EXTM3U')) return 'hls';
    if (t.startsWith('WEBVTT')) return 'subtitle';
    if (/^(<\?xml[^>]*>\s*)?<MPD[\s>]/.test(t)) return 'dash';
    if (/^1\r?\n\d\d:\d\d:\d\d,\d{3} --> /.test(t)) return 'subtitle';
    return null;
  }
  function record(url, kind, text) {
    if (!url || S.found.some((f) => f.url === url)) return;
    const item = { url, kind, time: Date.now(), format: kind === 'hls' ? 'm3u8' : kind === 'dash' ? 'mpd' : text.trimStart().startsWith('WEBVTT') ? 'vtt' : 'srt' };
    // Chỉ giữ nội dung khi URL không tải lại được từ ngoài trang (blob:/data:)
    if (!/^https?:/.test(url) || kind === 'subtitle') item.text = text.length <= MAX_TEXT ? text : undefined;
    S.found.push(item);
    if (S.found.length > MAX_FOUND) S.found.shift();
  }
  const SKIP_CT = /^(video\/(?!.*mpegurl)|audio\/(?!.*mpegurl)|font\/|text\/css|text\/html|application\/(javascript|wasm)|text\/javascript)/i;

  try {
    const origFetch = window.fetch;
    window.fetch = function (...args) {
      const p = origFetch.apply(this, args);
      p.then((res) => {
        try {
          const ct = res.headers.get('content-type') || '';
          const len = +res.headers.get('content-length') || 0;
          if (SKIP_CT.test(ct) || len > MAX_TEXT || !res.body) return;
          const url = res.url || (args[0] && (args[0].url || String(args[0])));
          // Chỉ đọc chunk đầu; nếu không giống playlist thì hủy luôn (không đọc hết segment).
          const reader = res.clone().body.getReader();
          (async () => {
            const first = await reader.read();
            if (first.done || !first.value) return;
            const head = new TextDecoder().decode(first.value.subarray(0, 1024));
            const kind = sniffText(head);
            if (!kind) return reader.cancel().catch(() => {});
            const parts = [first.value];
            let size = first.value.byteLength;
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              parts.push(value);
              size += value.byteLength;
              if (size > MAX_TEXT) return reader.cancel().catch(() => {});
            }
            record(url, kind, await new Blob(parts).text());
          })().catch(() => {});
        } catch (_) {}
      }).catch(() => {});
      return p;
    };
  } catch (_) {}

  try {
    const X = XMLHttpRequest.prototype;
    const origOpen = X.open;
    X.open = function (method, url) {
      this.__vdUrl = url;
      return origOpen.apply(this, arguments);
    };
    const origSend = X.send;
    X.send = function () {
      this.addEventListener('load', () => {
        try {
          const url = this.responseURL || String(this.__vdUrl || '');
          const rt = this.responseType;
          let txt = null;
          if (rt === '' || rt === 'text') txt = this.responseText;
          else if (rt === 'arraybuffer' && this.response && this.response.byteLength < MAX_TEXT) {
            const head = new TextDecoder().decode(new Uint8Array(this.response, 0, Math.min(1024, this.response.byteLength)));
            if (sniffText(head)) txt = new TextDecoder().decode(this.response);
          }
          if (txt && txt.length < MAX_TEXT) {
            const kind = sniffText(txt.slice(0, 1024));
            if (kind) record(url, kind, txt);
          }
        } catch (_) {}
      });
      return origSend.apply(this, arguments);
    };
  } catch (_) {}

  // ---------- 3. Ghi MediaSource ----------
  const sbMap = new WeakMap();
  function u8Of(data) {
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    return null;
  }
  function isInit(u8) {
    if (u8.length >= 4 && u8[0] === 0x1a && u8[1] === 0x45 && u8[2] === 0xdf && u8[3] === 0xa3) return true; // WebM EBML
    let off = 0;
    for (let i = 0; i < 4 && off + 8 <= u8.length; i++) {
      const size = ((u8[off] << 24) | (u8[off + 1] << 16) | (u8[off + 2] << 8) | u8[off + 3]) >>> 0;
      const type = String.fromCharCode(u8[off + 4], u8[off + 5], u8[off + 6], u8[off + 7]);
      if (type === 'moov' || type === 'ftyp') return true;
      if (size < 8) break;
      off += size;
    }
    return false;
  }
  function guessMime(u8) {
    if (!u8 || u8.length < 8) return 'video/mp4;unknown';
    if (u8[0] === 0x1a && u8[1] === 0x45 && u8[2] === 0xdf && u8[3] === 0xa3) return 'video/webm';
    // Tìm handler 'vide' / 'soun' trong moov (init) hoặc đoán theo kích thước đoạn
    const n = Math.min(u8.length, 4096);
    for (let i = 0; i + 4 < n; i++) {
      if (u8[i] === 0x76 && u8[i + 1] === 0x69 && u8[i + 2] === 0x64 && u8[i + 3] === 0x65) return 'video/mp4';
      if (u8[i] === 0x73 && u8[i + 1] === 0x6f && u8[i + 2] === 0x75 && u8[i + 3] === 0x6e) return 'audio/mp4';
    }
    return 'video/mp4;unknown';
  }

  try {
    const MS = window.MediaSource || window.ManagedMediaSource;
    if (MS && window.SourceBuffer) {
      const origAdd = MS.prototype.addSourceBuffer;
      MS.prototype.addSourceBuffer = function (mime) {
        const sb = origAdd.call(this, mime);
        const rec = { id: S.sbs.length, mime: String(mime), init: null, chunks: [], bytes: 0, appends: 0, created: Date.now(), sb, ms: this };
        sbMap.set(sb, rec);
        S.sbs.push(rec);
        return sb;
      };
      const origAppend = SourceBuffer.prototype.appendBuffer;
      SourceBuffer.prototype.appendBuffer = function (data) {
        let rec = sbMap.get(this);
        try {
          if (!rec) {
            // SourceBuffer tạo trước khi script được chèn → đăng ký muộn, đoán loại từ dữ liệu.
            rec = { id: S.sbs.length, mime: guessMime(u8Of(data)), init: null, chunks: [], bytes: 0, appends: 0, created: Date.now(), late: true, sb: this };
            sbMap.set(this, rec);
            S.sbs.push(rec);
          } else if (rec.late && /unknown/.test(rec.mime)) {
            rec.mime = guessMime(u8Of(data));
          }
        } catch (_) {}
        if (rec) {
          try {
            const u8 = u8Of(data);
            if (u8) {
              rec.appends++;
              rec.last = Date.now();
              const init = isInit(u8);
              if (init) rec.init = u8.slice();
              if (S.recording) {
                rec.chunks.push(init ? rec.init : u8.slice());
                rec.bytes += u8.byteLength;
              }
            }
          } catch (_) {}
        }
        return origAppend.call(this, data);
      };
    }
  } catch (_) {}

  function mainVideo() {
    let best = null, area = -1;
    for (const v of document.querySelectorAll('video')) {
      const a = (v.videoWidth || 1) * (v.videoHeight || 1) + (v.paused ? 0 : 1e9);
      if (a > area) { area = a; best = v; }
    }
    return best;
  }

  S.startRecording = (rate = 1, fromStart = true) => {
    for (const r of S.sbs) { r.chunks = []; r.bytes = 0; }
    S.recording = true;
    const v = mainVideo();
    if (v) {
      if (fromStart) v.currentTime = 0;
      v.playbackRate = rate;
      v.play().catch(() => {});
    }
  };
  S.stopRecording = () => {
    S.recording = false;
    const v = mainVideo();
    if (v) v.playbackRate = 1;
  };
  S.clear = () => { for (const r of S.sbs) { r.chunks = []; r.bytes = 0; } };
  // SourceBuffer còn gắn với MediaSource đang mở (player tạo lại MediaSource khi đổi video/chất lượng).
  function isLive(r) {
    try {
      if (r.ms) return r.ms.readyState !== 'closed' && [...r.ms.sourceBuffers].includes(r.sb);
      return Date.now() - (r.last || 0) < 60000;
    } catch (_) {
      return true;
    }
  }
  S.status = () => {
    const v = mainVideo();
    return {
      recording: S.recording,
      drm: S.drm,
      late: S.late,
      hasMSE: !!(window.MediaSource || window.ManagedMediaSource),
      sbs: S.sbs.map((r) => ({ id: r.id, mime: r.mime.replace(';unknown', ''), bytes: r.bytes, chunks: r.chunks.length, appends: r.appends, hasInit: !!r.init, live: isLive(r) })),
      found: S.found,
      video: v ? { t: v.currentTime, d: v.duration, ended: v.ended, rate: v.playbackRate } : null,
    };
  };
  // ---- Chuyển dữ liệu đã ghi sang extension (trang saver.html) theo từng phần ----
  // Không tự tải trong trang vì iframe sandbox (blob:null) bị Chrome chặn tải file.
  const prepared = {};
  function fileInfo(r) {
    const type = r.mime.split(';')[0].trim();
    const ext = /webm/.test(type) ? 'webm' : type === 'audio/mp4' ? 'm4a' : type === 'audio/mpeg' ? 'mp3' : /mp2t/.test(type) ? 'ts' : 'mp4';
    const kind = type.startsWith('audio') ? 'audio' : 'video';
    const sameKind = S.sbs.filter((x) => x.chunks.length && x.mime.split(';')[0] === r.mime.split(';')[0]).length > 1;
    return { type, ext, kind, suffix: `${kind}${sameKind ? '-' + (r.id + 1) : ''}` };
  }
  S.prepare = (id) => {
    const r = S.sbs[id];
    if (!r || !r.chunks.length) return null;
    const parts = r.chunks[0] === r.init || !r.init ? r.chunks : [r.init, ...r.chunks];
    const info = fileInfo(r);
    prepared[id] = new Blob(parts, { type: info.type });
    return { ...info, size: prepared[id].size, hasInit: !!r.init };
  };
  S.readPart = (id, start, end) =>
    new Promise((resolve, reject) => {
      const b = prepared[id];
      if (!b) return reject(new Error('not prepared'));
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result); // data:...;base64,...
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(b.slice(start, end));
    });
  S.release = (id) => {
    delete prepared[id];
  };

  S.save = (base, id) => {
    const r = S.sbs[id];
    if (!r || !r.chunks.length) return false;
    const parts = r.chunks[0] === r.init || !r.init ? r.chunks : [r.init, ...r.chunks];
    const type = r.mime.split(';')[0].trim();
    const ext = /webm/.test(type) ? 'webm' : type === 'audio/mp4' ? 'm4a' : type === 'audio/mpeg' ? 'mp3' : /mp2t/.test(type) ? 'ts' : 'mp4';
    const kind = type.startsWith('audio') ? 'audio' : 'video';
    const blob = new Blob(parts, { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const sameKind = S.sbs.filter((x) => x.chunks.length && x.mime.split(';')[0] === r.mime.split(';')[0]).length > 1;
    a.download = `${base}.${kind}${sameKind ? '-' + (r.id + 1) : ''}.${ext}`;
    a.style.display = 'none';
    (document.body || document.documentElement).appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 120000);
    return a.download;
  };
})();
