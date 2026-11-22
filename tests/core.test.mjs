import { parsePlaylist, playlistContentType, describeVariant } from '../lib/hls.js';
import { convert, parseCues } from '../lib/subtitles.js';
import { classify } from '../lib/media.js';
import assert from 'node:assert';
const m = parsePlaylist(`#EXTM3U
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="English",LANGUAGE="en",DEFAULT=YES,URI="audio/en.m3u8"
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Tiếng Việt",LANGUAGE="vi",URI="subs/vi.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360,CODECS="avc1.4d401e,mp4a.40.2",AUDIO="aud",SUBTITLES="subs"
360/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080,AUDIO="aud"
https://cdn.x.com/1080/index.m3u8
`, 'https://ex.com/v/master.m3u8');
assert(m.isMaster); assert.equal(m.variants[0].resolution,'1920x1080'); assert.equal(m.variants[1].url,'https://ex.com/v/360/index.m3u8');
assert.equal(m.media[1].URI,'https://ex.com/v/subs/vi.m3u8'); console.log(describeVariant(m.variants[0]));
const p = parsePlaylist(`#EXTM3U
#EXT-X-MAP:URI="init.mp4"
#EXTINF:4.0,
seg1.m4s
#EXTINF:4.0,
#EXT-X-BYTERANGE:1000@0
all.mp4
#EXTINF:2.5,
#EXT-X-BYTERANGE:500
all.mp4
#EXT-X-ENDLIST`, 'https://ex.com/a/b.m3u8');
assert.equal(p.segments.length,3); assert.deepEqual(p.segments[2].range,[1000,1499]); assert.equal(p.duration,10.5); assert.equal(playlistContentType(p),'mp4'); assert(p.endList);
const e = parsePlaylist('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="k"\n#EXTINF:2,\na.ts', 'https://x/'); assert.equal(e.encrypted,'AES-128');
const vtt = `WEBVTT
X-TIMESTAMP-MAP=MPEGTS:900000,LOCAL:00:00:00.000

1
00:00:01.000 --> 00:00:03.500 align:center
<v Bob>Xin <i>chào</i></v>

WEBVTT

00:00:01.000 --> 00:00:03.500
<v Bob>Xin <i>chào</i></v>

01:02.000 --> 01:04.250
Dòng 2
nhiều dòng`;
const srt = convert(vtt,'srt'); console.log(srt);
assert.equal(parseCues(srt).length, 2);
console.log(convert(srt,'vtt'));
assert.equal(classify('https://a.com/v.mp4?x=1','video/mp4',{'content-length':'5000000'}).kind,'video');
assert.equal(classify('https://a.com/s/1.ts','video/mp2t',{}), null);
assert.equal(classify('https://a.com/p','application/vnd.apple.mpegurl',{}).kind,'hls');
assert.equal(classify('https://a.com/s.vtt','',{}).kind,'subtitle');
assert.equal(classify('https://a.com/v.mp4','video/mp4',{'content-range':'bytes 0-1/90000000','content-length':'2'}).size, 90000000);
console.log('ALL OK');
