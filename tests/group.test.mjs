import assert from 'assert';
const { groupHls, groupSubs, guessLang } = await import('../lib/group.js');
const { parsePlaylist } = await import('../lib/hls.js');
const master = (id) => parsePlaylist(`#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080
1080/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2000000,RESOLUTION=1280x720
720/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360
360/playlist.m3u8`, `https://cdn.x.com/v/${id}/playlist.m3u8?token=abc`);
const media = parsePlaylist('#EXTM3U\n#EXTINF:6,\nseg1.ts\n#EXT-X-ENDLIST', 'https://cdn.x.com/v/B/720/playlist.m3u8');
// Video A (cũ) xuất hiện 2 lần với token khác; video B (đang phát) 2 lần + playlist con 720p vừa tải.
const g = groupHls([
  { url: 'https://cdn.x.com/v/A/playlist.m3u8?token=1', time: 100, pl: master('A') },
  { url: 'https://cdn.x.com/v/A/playlist.m3u8?token=2', time: 110, pl: master('A') },
  { url: 'https://cdn.x.com/v/B/playlist.m3u8?token=3', time: 105, pl: master('B') },
  { url: 'https://mirror.x.com/v/B/playlist.m3u8', time: 50, pl: master('B') }, // cùng playlist con với B → gộp
  { url: 'https://cdn.x.com/v/B/720/playlist.m3u8?token=9', time: 200, pl: media },
]);
console.log(g.map((x) => [x.url, x.activity, x.dupes, x.children.length]));
assert.equal(g[0].url, 'https://cdn.x.com/v/B/playlist.m3u8?token=3'); // có playlist con mới nhất → đang phát
assert.equal(g[0].activity, 200);
assert.equal(g[1].url, 'https://cdn.x.com/v/A/playlist.m3u8?token=2'); // gộp token, giữ URL mới nhất
assert.equal(g[1].dupes, 1);
assert.equal(g.length, 2); assert.equal(g[0].dupes, 1); // mirror cùng playlist con → gộp
// Cùng nội dung, khác URL master (vd master.m3u8 và index.m3u8 trỏ cùng con) → gộp
const g2 = groupHls([
  { url: 'https://cdn.x.com/v/A/playlist.m3u8', time: 1, pl: master('A') },
  { url: 'https://cdn.x.com/v/A/index.m3u8', time: 2, pl: parsePlaylist(`#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\n1080/playlist.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=1\n720/playlist.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=1\n360/playlist.m3u8`, 'https://cdn.x.com/v/A/index.m3u8') },
]);
assert.equal(g2.length, 1);

assert.equal(guessLang('https://x.com/subs/en/lesson.vtt'), 'en');
assert.equal(guessLang('https://x.com/lesson_vi.vtt'), 'vi');
assert.equal(guessLang('https://x.com/a.vtt?lang=fr'), 'fr');
assert.equal(guessLang('', 'English'), 'en');
assert.equal(guessLang('https://x.com/lesson.vtt'), '');

const segs = Array.from({ length: 12 }, (_, i) => ({ url: `https://cdn.x.com/v/B/subs/en/seg${12 - i}.vtt`, time: 300 + i }));
const s = groupSubs([
  ...segs,
  { url: 'https://cdn.x.com/v/A/captions_en.vtt', time: 100 },         // video cũ, tiếng Anh
  { url: 'https://cdn.x.com/v/B/captions_en.vtt?sig=1', time: 210 },   // video đang phát
  { url: 'https://cdn.x.com/v/B/captions_en.vtt?sig=2', time: 220 },   // trùng (khác chữ ký)
  { url: 'https://cdn.x.com/v/B/captions_vi.vtt', time: 215 },
  { vtt: 'WEBVTT', label: 'English', cues: true, time: 999 },         // đang hiển thị trong player
]);

assert.deepEqual(s.primary.map((x) => x.lang), ['en', 'vi']);
assert.ok(s.primary[0].cues);
assert.equal(s.others.length, 3); // đoạn HLS en + 2 file en (B, A) bị thu gọn
const seg = s.others.find((x) => x.seg);
assert.equal(seg.segs.length, 12);
assert.equal(seg.segs[0].split('/').pop(), 'seg1.vtt');
// Không có cue: nhóm đoạn mới nhất (video đang phát) thắng file tiếng Anh cũ
const s2 = groupSubs([...segs, { url: 'https://cdn.x.com/v/A/captions_en.vtt', time: 100 }]);
assert.ok(s2.primary[0].seg);
assert.equal(s2.others[0].url, 'https://cdn.x.com/v/A/captions_en.vtt');
// Master đã có phụ đề → bỏ đoạn
const s3 = groupSubs([...segs, { url: 'https://cdn.x.com/v/A/captions_en.vtt', time: 100 }], { dropSegments: true });
assert.equal(s3.primary.length, 1); assert.ok(!s3.primary[0].seg);
console.log('GROUP OK');
