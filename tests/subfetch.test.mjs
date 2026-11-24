import assert from 'assert';
const VTT = 'WEBVTT\n\n00:01.000 --> 00:02.000\nHello\n';
let page = {}; const calls = [];
globalThis.chrome = {
  runtime: { id: 'x' }, storage: { session: { get: async () => ({}) } }, declarativeNetRequest: { updateSessionRules: async () => {} },
  scripting: { executeScript: async ({ target, args }) => { calls.push(target); return [{ result: page[args[0]] ?? null }]; } },
};
let net = {};
globalThis.fetch = async (u) => { const r = net[u]; if (!r) throw new TypeError('Failed to fetch'); return { ok: r[0] < 400, status: r[0], text: async () => r[1] }; };
const { getSubText, usable } = await import('../lib/subfetch.js');
const { navCut, samePage } = await import('../lib/nav.js');
const { groupSubs } = await import('../lib/group.js');
const U = 'https://cdn.x.com/a.vtt', o = { tabId: 1, frameId: 7 };
const code = async (p) => { try { await p; } catch (e) { return e.code; } };
net[U] = [200, VTT]; assert.equal(await getSubText(U, o), VTT);
net[U] = [403, '<html>no']; assert.equal(await getSubText(U, { ...o, inline: { [U]: VTT } }), VTT); // bản đã bắt được dù link hết hạn
page[U] = VTT; assert.equal(await getSubText(U, o), VTT); // 403 → tải trong trang
assert.deepEqual(calls.at(-1), { tabId: 1, frameIds: [7] });
page = {}; assert.equal(await code(getSubText(U, o)), 'expired');
net[U] = [200, '<!DOCTYPE html><html>login --> x']; assert.equal(await code(getSubText(U, o)), 'empty');
net[U] = [200, 'WEBVTT\n\n']; assert.equal(await code(getSubText(U, o)), 'empty');
assert.equal(await getSubText(U, { ...o, segment: true }), 'WEBVTT\n\n');
delete net[U]; assert.equal(await code(getSubText(U, o)), 'network');
assert.ok(usable('[Script Info]\nDialogue', { anyText: true }));
assert.ok(!usable('{"error":1}', { anyText: true }));
assert.ok(!usable('<html></html>', { anyText: true }));
assert.ok(samePage('https://a.com/l/1?t=3', 'https://a.com/l/1/#x'));
assert.equal(navCut({ oldUrl: 'https://a.com/l/1', newUrl: 'https://a.com/l/1?t=9', now: 1e6 }), 0); // giữ phụ đề
assert.equal(navCut({ oldUrl: 'https://a.com/l/1', newUrl: 'https://a.com/l/2', now: 1e6 }), 1e6 - 8000);
assert.equal(navCut({ oldUrl: 'https://a.com/', newUrl: 'https://b.com/', now: 1e6, mainAt: 999000 }), 999000);
const g = groupSubs([{ url: 'https://c/old_en.vtt', lang: 'en', time: 9, stale: true }, { url: 'https://c/new_en.vtt', lang: 'en', time: 5 }, { vtt: 'x', cues: true, partial: true, lang: 'en', time: 99 }]);
assert.deepEqual(g.primary.map((x) => x.url), ['https://c/new_en.vtt']); assert.equal(g.others.length, 2);
console.log('SUBFETCH OK');
const { isNotSpeech, looksLikeThumbs, parseCues } = await import('../lib/subtitles.js');
const cue = (...t) => parseCues('WEBVTT\n\n' + t.map((x, i) => `00:0${i}.000 --> 00:0${i + 1}.000\n${x}\n`).join('\n'));
assert.ok(isNotSpeech(cue('https://cdn-media.circle.so/9572/mosaic.jpg#xywh=0,0,285,160', 'https://cdn-media.circle.so/9572/mosaic.jpg#xywh=285,0,285,160')));
assert.ok(isNotSpeech(cue('sprite-1.webp', 'storyboard.png?x=1#xywh=0,0,1,1')));
assert.ok(isNotSpeech(cue('{"a":1}')));
assert.ok(!isNotSpeech(cue('[Music]', 'Open photo.jpg in the editor', 'Hi')));
assert.ok(!isNotSpeech(cue('[Music]')));
assert.ok(looksLikeThumbs('https://x/thumbnails.vtt') && !looksLikeThumbs('https://x/en.vtt'));
console.log('THUMBS OK');
