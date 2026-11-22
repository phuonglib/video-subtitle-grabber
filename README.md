<p align="center">
  <img src="icons/icon512.png" alt="Video & Subtitle Grabber logo" width="128" height="128">
</p>

<h1 align="center">Video & Subtitle Grabber</h1>

<p align="center">
  A Chrome extension (Manifest V3) that detects the video playing on a page and saves it together with its subtitles.
  <br>
  <a href="README.vi.md">Tiếng Việt</a> · English
</p>

---

## Features

- **Detects media while it plays**: direct MP4/WebM files, HLS (`.m3u8`) and DASH (`.mpd`) streams, and subtitles (VTT/SRT files, `<track>` elements, and cues already loaded in the player).
- **Recognises disguised playlists**: inspects fetch/XHR responses, so playlists without an `.m3u8` extension or loaded from `blob:` URLs are still found.
- **Picks the video that's actually playing**: duplicate playlists (same path, different tokens) and child playlists are merged, and the most recently active video is marked **▶ Now playing**. Other videos are collapsed underneath.
- **One subtitle per language**: subtitles of the playing video come first. HLS subtitle segments are merged into a single file, and the rest are collapsed.
- **Rename before saving**: edit the video file name and each subtitle file name in the download dialog. Subtitles follow the video name (`lesson.en.srt`) so players like VLC/IINA load them automatically.
- **Video + subtitles by default**: choose *Video only* or *Subtitles only* if you need just one.
- **HLS downloader**: pick the quality and separate audio track, download segments in parallel, save as `.ts` or `.mp4` (fMP4), and convert subtitles to SRT or WebVTT.
- **MediaSource recorder**: a fallback for players that stream through `blob:` with no usable link. It copies the data the player appends while the video plays.
- **Bilingual UI**: English / Tiếng Việt, switchable in the popup. Ships the Be Vietnam Pro font locally, so it works offline.

## Install (developer mode)

1. Download or clone this repository.
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the project folder.
4. Pin the extension to the toolbar.
5. Recommended: open the extension's **Details** and set **Site access** to **On all sites**, so it can see videos embedded from other domains.

## Usage

1. Open a page with a video and **start playing it**. If the page was open before you installed the extension, reload it first.
2. Click the extension icon. The badge shows how many media items were captured.
3. Choose what to save:

| Item | Action |
|---|---|
| MP4 / WebM | **Download…** opens a dialog: rename the files, pick SRT/VTT, and choose *Video + subtitles* or *Video only*. |
| HLS (`.m3u8`) | **Download…** opens the downloader page: pick quality, audio and file names, then **Start download**. Keep that tab open until it finishes. |
| Subtitle | **Download…** lets you rename it and choose the format. |
| DASH (`.mpd`) | **Copy yt-dlp command** and run it in a terminal. |
| MSE recorder | Pick a speed, click **● Record from start**, let the video play to the end without seeking, then click **■ Stop & save…**. |

Separate video and audio files can be merged with [ffmpeg](https://ffmpeg.org/):

```bash
ffmpeg -i name.video.mp4 -i name.audio.m4a -c copy name.mp4
```

## How it works

| File | Role |
|---|---|
| `background.js` | Service worker. Watches network responses (`webRequest`) and classifies videos, playlists and subtitles by extension and Content-Type. Records the player's request headers per host. |
| `inject.js` | Runs in the page (MAIN world). Sniffs fetch/XHR bodies, records MediaSource appends, and detects DRM (`setMediaKeys`). |
| `popup.js` | Scans `<video>`, `<track>` and `textTracks` in every frame, groups the results and renders the UI. |
| `downloader.js` | HLS downloader: parallel segment download, concatenation, and subtitle merging and conversion. |
| `saver.js` | Pulls an MSE recording from the page in chunks and saves it. |
| `lib/group.js` | Deduplication: merges playlists, picks the playing video, keeps one subtitle per language. |
| `lib/hls.js`, `lib/subtitles.js` | HLS playlist parser; VTT/SRT parser and converter. |
| `lib/net.js` | Replays the player's `Referer`/`Origin` headers through `declarativeNetRequest` session rules. |
| `lib/i18n.js`, `lib/ui.js` | Translations and shared dialog components. |

## Deliberate limitations

- **No DRM circumvention and no decryption.** Streams protected by Widevine, PlayReady or FairPlay, and HLS encrypted with AES-128 or SAMPLE-AES, are reported as unsupported. The extension will not try to break them. Pull requests that add DRM removal or decryption will not be accepted.
- Signed or one-time segment URLs that expire as soon as the player uses them cannot be re-downloaded. This extension does not reverse-engineer token schemes.
- YouTube splits audio and video and rotates URL signatures, so use [yt-dlp](https://github.com/yt-dlp/yt-dlp) instead.
- HLS segments are assembled in memory, so very long videos (more than about 2 GB) may exhaust the tab's memory.

## Responsible use

This tool is for saving content you have the right to keep: your own uploads, openly licensed media, or content whose owner allows downloading. Respect copyright law and each site's terms of service. You are responsible for how you use it.

## Development

There is no build step: the extension is plain ES modules. After editing, click **↻ Reload** on `chrome://extensions` and reload the video page.

Run the unit tests (Node.js 18+):

```bash
npm test
```

Contributions are welcome. Please open an issue first to discuss larger changes, and keep the UI strings in both languages (`lib/i18n.js`).

## License

[MIT](LICENSE) for the code. The bundled [Be Vietnam Pro](https://github.com/bettergui/BeVietnamPro) font is licensed under the [SIL Open Font License 1.1](fonts/OFL.txt).
