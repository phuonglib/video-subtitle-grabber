// Gom nhóm & lọc trùng: chọn video đang phát, ẩn playlist con / đoạn phụ đề, 1 phụ đề cho mỗi ngôn ngữ.

export function stripQuery(u) {
  try {
    const x = new URL(u);
    return x.origin + x.pathname;
  } catch {
    return u;
  }
}

export function dirOf(u) {
  const k = stripQuery(u);
  return k.slice(0, k.lastIndexOf('/') + 1);
}

const LANG_NAMES = {
  english: 'en', 'tiếng anh': 'en', vietnamese: 'vi', 'tiếng việt': 'vi', french: 'fr', spanish: 'es', german: 'de',
  japanese: 'ja', korean: 'ko', chinese: 'zh', portuguese: 'pt', italian: 'it', russian: 'ru', thai: 'th', indonesian: 'id',
};

// Đoán mã ngôn ngữ từ nhãn hoặc URL (…/en/…, _en.vtt, .vi.srt, lang=en).
export function guessLang(url = '', label = '') {
  const l = label.toLowerCase().trim();
  for (const [name, code] of Object.entries(LANG_NAMES)) if (l.includes(name)) return code;
  if (/^[a-z]{2}(-[a-z]{2})?$/i.test(l)) return l.slice(0, 2).toLowerCase();
  let path = '';
  let q = null;
  try {
    const x = new URL(url);
    path = decodeURIComponent(x.pathname).toLowerCase();
    q = x.searchParams;
  } catch {}
  const qp = q && (q.get('lang') || q.get('language') || q.get('locale'));
  if (qp && /^[a-z]{2}/i.test(qp)) return qp.slice(0, 2).toLowerCase();
  const m =
    path.match(/[._\-/]([a-z]{2})(?:[-_][a-z]{2})?\.(?:vtt|srt|webvtt|ttml|dfxp|xml|ass)$/) ||
    path.match(/\/(?:subs?|subtitles?|captions?|text)\/([a-z]{2})(?:[-_][a-z]{2})?\//) ||
    path.match(/\/([a-z]{2})(?:[-_][a-z]{2})?\/[^/]+\.(?:vtt|srt|webvtt)$/);
  return m ? m[1] : '';
}

/**
 * entries: [{ url, time, pl? }] (pl = playlist đã phân tích, có thể null nếu lỗi).
 * Trả về danh sách playlist đã lọc, xếp theo hoạt động gần nhất (đầu = đang phát),
 * mỗi phần tử có thêm: activity, dupes (số bản trùng đã gộp), children (URL playlist con đã thấy).
 */
export function groupHls(entries) {
  // 1. Cùng đường dẫn, khác token/query → gộp.
  const byKey = new Map();
  for (const e of entries) {
    const k = stripQuery(e.url);
    const old = byKey.get(k);
    if (!old) byKey.set(k, { ...e, key: k, activity: e.time || 0, dupes: 0, children: [] });
    else {
      old.dupes++;
      if ((e.time || 0) >= old.activity) {
        old.activity = e.time || 0;
        old.url = e.url; // giữ URL mới nhất (token còn hạn)
        if (e.pl) old.pl = e.pl;
      }
      if (!old.pl && e.pl) old.pl = e.pl;
    }
  }
  const list = [...byKey.values()];

  // 2. Playlist con (chất lượng / audio / phụ đề) của một master → ẩn, cộng thời gian hoạt động cho master.
  const owner = new Map();
  for (const m of list) {
    if (!m.pl?.isMaster) continue;
    const kids = [...m.pl.variants.map((v) => v.url), ...m.pl.media.filter((x) => x.URI).map((x) => x.URI)];
    m.childKeys = kids.map(stripQuery);
    for (const k of m.childKeys) if (!owner.has(k)) owner.set(k, m);
  }
  const out = [];
  for (const e of list) {
    const m = !e.pl?.isMaster && owner.get(e.key);
    if (m) {
      m.activity = Math.max(m.activity, e.activity);
      m.children.push(e.url);
    } else out.push(e);
  }

  // 3. Master khác URL nhưng cùng nội dung (cùng danh sách playlist con) → gộp.
  const bySig = new Map();
  const res = [];
  for (const e of out) {
    const sig = e.pl?.isMaster && e.childKeys.length ? [...e.childKeys].sort().join('|') : null;
    const old = sig && bySig.get(sig);
    if (old) {
      old.dupes += 1 + e.dupes;
      old.children.push(...e.children);
      if (e.activity > old.activity) {
        old.activity = e.activity;
        old.url = e.url;
        old.pl = e.pl;
      }
      continue;
    }
    if (sig) bySig.set(sig, e);
    res.push(e);
  }
  return res.sort((a, b) => b.activity - a.activity);
}

/**
 * subs: [{ url?, vtt?, label, lang, time, cues? }]
 * opts.dropSegments: bỏ đoạn phụ đề HLS (khi master đang phát đã khai báo phụ đề).
 * Trả về { primary, others }:
 *  - Đoạn phụ đề HLS (≥3 file cùng thư mục) gộp thành 1 mục { seg: true, segs: [url…] }.
 *  - primary: 1 phụ đề cho mỗi ngôn ngữ — ưu tiên phụ đề đang nạp trong trình phát, rồi mục mới nhất.
 *  - others: phần còn lại (của video khác / bản cũ).
 */
export function groupSubs(subs, opts = {}) {
  const seen = new Map();
  const files = [];
  const cues = [];
  for (const s of subs) {
    const x = { ...s, lang: (s.lang || guessLang(s.url, s.label) || '').toLowerCase() };
    if (x.cues || !x.url) {
      cues.push(x);
      continue;
    }
    const k = stripQuery(x.url);
    const old = seen.get(k);
    if (old) {
      if ((x.time || 0) > (old.time || 0)) Object.assign(old, x, { label: x.label || old.label, lang: x.lang || old.lang, stale: !!x.stale && !!old.stale });
      else if (!x.stale) old.stale = false;
      continue;
    }
    seen.set(k, x);
    files.push(x);
  }

  // Đoạn phụ đề HLS: nhiều file nhỏ cùng thư mục → 1 mục.
  const byDir = new Map();
  for (const f of files) {
    const d = dirOf(f.url);
    if (!byDir.has(d)) byDir.set(d, []);
    byDir.get(d).push(f);
  }
  const cands = [];
  for (const [dir, all] of byDir) {
    const fresh = all.filter((a) => !a.stale);
    const arr = fresh.length ? fresh : all;
    if (arr.length >= 3) {
      if (opts.dropSegments) continue;
      const nat = (a, b) => stripQuery(a.url).localeCompare(stripQuery(b.url), undefined, { numeric: true });
      arr.sort(nat);
      cands.push({
        seg: true,
        dir,
        segs: arr.map((a) => a.url),
        lang: arr.find((a) => a.lang)?.lang || '',
        format: 'vtt',
        time: Math.max(...arr.map((a) => a.time || 0)),
        stale: arr.every((a) => a.stale),
      });
    } else cands.push(...all);
  }

  const newest = (a, b) => (b.time || 0) - (a.time || 0);
  const primary = [];
  const others = [];
  const langs = new Set();
  // Phụ đề đang nạp trong trình phát = của video đang xem → ưu tiên trước.
  // Cue mới nạp một phần (player nạp dần theo đoạn) xếp sau file phụ đề đầy đủ.
  const full = cues.filter((c) => !c.partial).sort(newest);
  const part = cues.filter((c) => c.partial).sort(newest);
  for (const c of [...full, ...cands.sort(newest), ...part]) {
    // Phụ đề của trang trước (SPA) không bao giờ được chọn mặc định.
    if (c.stale || langs.has(c.lang)) others.push(c);
    else {
      langs.add(c.lang);
      primary.push(c);
    }
  }
  return { primary, others };
}
