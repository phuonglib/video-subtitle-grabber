// Song ngữ Việt / Anh. Ngôn ngữ do người dùng chọn, lưu ở chrome.storage.local ('lang').

const DICT = {
  vi: {
    // Chung
    language: 'Ngôn ngữ',
    error: 'Lỗi: {msg}',
    video: 'Video',
    audio: 'Âm thanh',
    subtitle: 'Phụ đề',
    cancel: 'Hủy',
    doDownload: 'Tải xuống',
    notHls: 'Không phải playlist HLS',
    stopped: 'Đã dừng',
    readFail: 'Không đọc được dữ liệu từ trang',
    missingData: 'Thiếu dữ liệu ({got}/{want})',

    // Hộp thoại tải
    dlgTitle: 'Tải xuống',
    fVideoName: 'Tên file video',
    fAudioName: 'Tên file âm thanh',
    fSubName: 'Tên file phụ đề',
    modeBoth: 'Video + phụ đề',
    modeVideo: 'Chỉ video',
    modeSubs: 'Chỉ phụ đề',
    subFormat: 'Định dạng phụ đề',
    noSubsFound: 'Không tìm thấy phụ đề trên trang.',
    nameHint: 'Phụ đề đặt cùng tên với video để trình phát (VLC, IINA…) tự nhận.',
    nothingSelected: 'Chưa chọn gì để tải.',

    // Popup
    rescan: '↻ Quét lại',
    rescanTitle: 'Quét lại trang',
    emptyHtml: 'Chưa phát hiện video nào.<br />Hãy bấm phát video trên trang rồi mở lại popup.',
    secVideo: 'Video / Luồng',
    secSubs: 'Phụ đề',
    toastStarted: 'Đã bắt đầu tải: {name}',
    toastStartedN: 'Đã bắt đầu tải {n} file',
    copied: 'Đã sao chép lệnh',
    subFail: 'Không tải được phụ đề: {msg}',
    download: 'Tải xuống…',
    copyYtdlp: 'Copy lệnh yt-dlp',
    ytdlpTitle: 'Sao chép lệnh để dán vào Terminal. Cần cài yt-dlp. Chỉ tải video bạn có quyền tải.',
    readingPl: 'Đang đọc playlist…',
    hlsQualities: '{n} chất lượng',
    hlsBest: ' (cao nhất {r})',
    hlsAudios: ' · {n} audio',
    hlsSubs: ' · {n} phụ đề',
    hlsSubTag: 'HLS phụ đề',
    hlsMedia: '{n} đoạn · ~{m} phút · {type}',
    encryptedTag: ' · Mã hóa {e} — không hỗ trợ',
    plReadFail: 'Không đọc được playlist: {msg}',
    dashMeta: 'Luồng DASH (video và audio tách riêng) — dùng yt-dlp để tải & ghép.',
    playerSubs: 'Phụ đề trong trình phát',
    cuesMeta: '{n} dòng đã nạp trong trình phát (xem hết video để có đủ nếu phụ đề nạp dần)',
    drmBanner:
      'Trang này dùng DRM ({drm}). Video được bảo vệ bằng DRM sẽ không tải được — extension không phá khóa DRM. ' +
      'Phụ đề và các luồng không mã hóa (nếu có) vẫn hiện bên dưới.',
    accessHtml:
      '<b>Extension chưa được phép tự chạy trên mọi trang.</b><br>' +
      'Video trong khung nhúng từ trang khác sẽ không bắt được. Cách bật:<br>' +
      '1. Mở <code>chrome://extensions</code> → bấm <b>Chi tiết</b> ở extension này<br>' +
      '2. Mục <b>Quyền truy cập trang web</b> → chọn <b>Trên tất cả các trang web</b><br>' +
      '3. Tải lại trang video (F5)',
    rateTitle: 'Tốc độ phát khi ghi (nhanh hơn = ghi xong sớm hơn; > 4× sẽ tắt tiếng)',
    recStart: '● Ghi từ đầu',
    recStop: '■ Dừng & lưu…',
    recClear: 'Xóa bản ghi',
    noData: 'Chưa ghi được dữ liệu nào',
    mseName: 'Ghi luồng MediaSource (blob:)',
    mseHint:
      'Dùng khi không có link tải ở trên. Extension chép lại dữ liệu player nạp vào trình phát trong lúc video chạy — ' +
      'hãy để video chạy đến hết (không tua), rồi bấm "Dừng & lưu". Video và audio có thể ra 2 file riêng.',
    recording: '● ĐANG GHI · ',
    recorded: ' · đã ghi {s}',
    played: ' · phát {p}%',
    endedHint: ' · video đã hết, bấm "Dừng & lưu"',
    drmRec: ' · có DRM: dữ liệu ghi được sẽ bị mã hóa, không xem được',
    lateInit:
      ' · ⚠ bộ ghi gắn muộn nên thiếu phần đầu (init) — file có thể không mở được. ' +
      'Bật quyền "Trên tất cả các trang web" rồi F5 để ghi chuẩn.',
    attaching: 'Đang gắn bộ ghi vào khung video…',
    attachFail:
      'Không gắn được bộ ghi vào khung video ({url}). ' +
      'Kiểm tra quyền "Truy cập trang web" của extension (xem hướng dẫn ở trên) rồi tải lại trang.',
    mseDrm: 'Video dùng DRM — không thể ghi.',
    mseNoData: 'Chưa thấy dữ liệu nào được nạp vào trình phát. Hãy bấm phát video vài giây rồi bấm "↻ Quét lại".',
    nowPlaying: '▶ Đang phát',
    otherVideos: 'Video khác trên trang ({n})',
    otherSubs: 'Phụ đề khác / của video khác ({n})',
    segParts: 'phụ đề HLS · {n} đoạn',
    hlsSubsHint: 'Phụ đề của video đang phát nằm trong luồng HLS — bấm "Tải xuống…" ở thẻ video để tải kèm.',

    // Trang tải HLS
    hlsTitle: 'Tải luồng HLS',
    quality: 'Chất lượng',
    sepAudio: 'Âm thanh riêng',
    noSepAudio: 'Không tải audio riêng',
    isDefault: 'mặc định',
    fileNames: 'Tên file',
    extAuto: 'phần mở rộng (.mp4 / .ts / .m4a) được thêm tự động',
    start: 'Bắt đầu tải',
    stop: 'Dừng',
    missingSrc: 'Thiếu URL playlist.',
    blobPlErr: 'Không đọc được playlist blob: (hãy mở lại popup và thử lại)',
    blobRelWarn:
      'Playlist (blob:) chứa đường dẫn tương đối — không biết máy chủ gốc nên có thể tải lỗi. ' +
      'Nếu lỗi, hãy dùng thẻ "MSE – Ghi luồng" trong popup.',
    ready: 'Sẵn sàng. Kiểm tra tên file rồi bấm "Bắt đầu tải".',
    readPl: '→ {label}: đọc playlist…',
    nested: 'Playlist lồng nhau không được hỗ trợ',
    encErr: 'Luồng được mã hóa ({e}). Extension không giải mã nội dung được bảo vệ.',
    encWarn: 'Luồng được mã hóa ({e}) — không thể tải. Extension không giải mã nội dung được bảo vệ.',
    liveWarn: '⚠ Đây là luồng LIVE — chỉ tải được phần đang có trong playlist.',
    segInfo: '  {n} đoạn · ~{m} phút · {type}',
    hostRec: '  Máy chủ: {host} · dùng lại header của player: {h}',
    hostNoRec: '  Máy chủ: {host} · chưa thấy player tải từ host này — chỉ gửi Referer',
    none: '(không có)',
    progressLine: '{label}: {d}/{n} đoạn · {size} · {speed}/s',
    saved: '✔ Đã lưu {name} ({size})',
    saveErr: 'Lỗi lưu file: {msg}',
    subLog: '→ Phụ đề {name}…',
    subErr: '✖ Lỗi phụ đề: {msg}',
    sub_expired: 'Link phụ đề đã hết hạn ({d}). Bật phụ đề trong trình phát rồi bấm Quét lại.',
    sub_empty: 'Máy chủ không trả về phụ đề. Bật phụ đề trong trình phát rồi bấm Quét lại.',
    sub_network: 'Không tải được phụ đề. Kiểm tra mạng rồi thử lại. {d}',
    notVideo: 'Máy chủ không trả về video. Tải lại trang rồi thử lại.',
    done: 'Hoàn tất.',
    mergeHint: 'Video và audio là 2 file riêng. Ghép bằng ffmpeg (chạy trong Terminal):',
    tsHint: 'File .ts mở được bằng VLC. Đổi sang MP4 (không mất chất lượng):',
    stoppedLog: 'Đã dừng.',
    whileFetching: ' khi tải: {url}',
    hint400:
      'Gợi ý: (1) Quay lại tab video, phát video vài giây (để extension học header của player), rồi bấm "Bắt đầu tải" lại. ' +
      '(2) Link có thể đã hết hạn — mở lại popup để lấy playlist mới. ' +
      '(3) Nếu vẫn lỗi: dùng thẻ "MSE – Ghi luồng" trong popup.',
    playlistThis: 'Playlist này · {n} đoạn · {type}',
    subsInPl: 'Phụ đề trong playlist này',

    // Trang lưu bản ghi MSE
    saverTitle: 'Lưu bản ghi MediaSource',
    preparing: 'Đang chuẩn bị…',
    keepOpen: 'Giữ tab video mở cho tới khi lưu xong.',
    save: 'Lưu',
    noRecorder: 'Không tìm thấy bộ ghi trong tab video (tab đã đóng hoặc tải lại?)',
    nothingRec: 'Chưa ghi được dữ liệu nào.',
    trackName: 'Luồng {mime} · {size}',
    transferring: '→ Đang chuyển luồng {mime} ({size})…',
    savedTo: '✔ Đã lưu {name} ({size}) vào thư mục Tải xuống',
    noInit: '⚠ Thiếu init segment — file có thể không mở được (bộ ghi gắn muộn).',
    ffmpegMerge: 'Ghép hình + tiếng bằng ffmpeg (chạy trong Terminal):',
    errStatus: 'Lỗi.',
  },

  en: {
    language: 'Language',
    error: 'Error: {msg}',
    video: 'Video',
    audio: 'Audio',
    subtitle: 'Subtitle',
    cancel: 'Cancel',
    doDownload: 'Download',
    notHls: 'Not an HLS playlist',
    stopped: 'Stopped',
    readFail: "Couldn't read data from the page",
    missingData: 'Incomplete data ({got}/{want})',

    dlgTitle: 'Download',
    fVideoName: 'Video file name',
    fAudioName: 'Audio file name',
    fSubName: 'Subtitle file name',
    modeBoth: 'Video + subtitles',
    modeVideo: 'Video only',
    modeSubs: 'Subtitles only',
    subFormat: 'Subtitle format',
    noSubsFound: 'No subtitles found on this page.',
    nameHint: 'Subtitles share the video name so players (VLC, IINA…) load them automatically.',
    nothingSelected: 'Nothing selected to download.',

    rescan: '↻ Rescan',
    rescanTitle: 'Scan the page again',
    emptyHtml: 'No video detected yet.<br />Play the video on the page, then reopen this popup.',
    secVideo: 'Video / Streams',
    secSubs: 'Subtitles',
    toastStarted: 'Download started: {name}',
    toastStartedN: 'Started {n} downloads',
    copied: 'Command copied',
    subFail: "Couldn't download subtitle: {msg}",
    download: 'Download…',
    copyYtdlp: 'Copy yt-dlp command',
    ytdlpTitle: 'Copies a command to paste in Terminal. Needs yt-dlp installed. Only download videos you have the right to.',
    readingPl: 'Reading playlist…',
    hlsQualities: '{n} qualities',
    hlsBest: ' (up to {r})',
    hlsAudios: ' · {n} audio',
    hlsSubs: ' · {n} subtitles',
    hlsSubTag: 'HLS subtitles',
    hlsMedia: '{n} segments · ~{m} min · {type}',
    encryptedTag: ' · Encrypted ({e}) — not supported',
    plReadFail: "Couldn't read playlist: {msg}",
    dashMeta: 'DASH stream (separate video and audio) — use yt-dlp to download & merge.',
    playerSubs: 'Player subtitles',
    cuesMeta: '{n} lines loaded in the player (play to the end if subtitles load progressively)',
    drmBanner:
      'This page uses DRM ({drm}). DRM-protected video cannot be downloaded — this extension does not break DRM. ' +
      'Subtitles and unencrypted streams (if any) are still listed below.',
    accessHtml:
      "<b>The extension isn't allowed to run on all sites.</b><br>" +
      "Videos embedded from other sites won't be detected. To enable:<br>" +
      '1. Open <code>chrome://extensions</code> → click <b>Details</b> on this extension<br>' +
      '2. Under <b>Site access</b> → choose <b>On all sites</b><br>' +
      '3. Reload the video page (F5)',
    rateTitle: 'Playback speed while recording (faster = done sooner; above 4× is muted)',
    recStart: '● Record from start',
    recStop: '■ Stop & save…',
    recClear: 'Discard recording',
    noData: 'Nothing recorded yet',
    mseName: 'Record MediaSource stream (blob:)',
    mseHint:
      'Use this when there is no download link above. The extension copies the data the player feeds to the video element while it plays — ' +
      'let the video play to the end (no seeking), then click "Stop & save". Video and audio may be saved as 2 files.',
    recording: '● RECORDING · ',
    recorded: ' · {s} recorded',
    played: ' · played {p}%',
    endedHint: ' · video ended, click "Stop & save"',
    drmRec: ' · DRM detected: recorded data will be encrypted and unplayable',
    lateInit:
      ' · ⚠ recorder attached late, so the init segment is missing — the file may not open. ' +
      'Set site access to "On all sites" and reload to record properly.',
    attaching: 'Attaching recorder to the video frame…',
    attachFail:
      "Couldn't attach the recorder to the video frame ({url}). " +
      "Check the extension's \"Site access\" setting (see above), then reload the page.",
    mseDrm: 'The video uses DRM — recording is not possible.',
    mseNoData: 'No data has reached the player yet. Play the video for a few seconds, then click "↻ Rescan".',
    nowPlaying: '▶ Now playing',
    otherVideos: 'Other videos on this page ({n})',
    otherSubs: 'Other subtitles / other videos ({n})',
    segParts: 'HLS subtitle · {n} parts',
    hlsSubsHint: 'Subtitles for the playing video are part of the HLS stream — click "Download…" on the video card to include them.',

    hlsTitle: 'Download HLS stream',
    quality: 'Quality',
    sepAudio: 'Separate audio',
    noSepAudio: "Don't download separate audio",
    isDefault: 'default',
    fileNames: 'File names',
    extAuto: 'the extension (.mp4 / .ts / .m4a) is added automatically',
    start: 'Start download',
    stop: 'Stop',
    missingSrc: 'Missing playlist URL.',
    blobPlErr: "Couldn't read the blob: playlist (reopen the popup and try again)",
    blobRelWarn:
      'This blob: playlist uses relative paths — the origin server is unknown, so downloading may fail. ' +
      'If it does, use the "MSE – Record" card in the popup.',
    ready: 'Ready. Check the file names, then click "Start download".',
    readPl: '→ {label}: reading playlist…',
    nested: 'Nested playlists are not supported',
    encErr: 'The stream is encrypted ({e}). This extension does not decrypt protected content.',
    encWarn: 'The stream is encrypted ({e}) — cannot download. This extension does not decrypt protected content.',
    liveWarn: '⚠ This is a LIVE stream — only the part currently in the playlist will be downloaded.',
    segInfo: '  {n} segments · ~{m} min · {type}',
    hostRec: "  Server: {host} · reusing the player's headers: {h}",
    hostNoRec: '  Server: {host} · player not seen loading from this host yet — sending Referer only',
    none: '(none)',
    progressLine: '{label}: {d}/{n} segments · {size} · {speed}/s',
    saved: '✔ Saved {name} ({size})',
    saveErr: 'Error saving file: {msg}',
    subLog: '→ Subtitle {name}…',
    subErr: '✖ Subtitle error: {msg}',
    sub_expired: 'The subtitle link has expired ({d}). Turn subtitles on in the player, then press Rescan.',
    sub_empty: 'The server did not return subtitles. Turn subtitles on in the player, then press Rescan.',
    sub_network: "Couldn't download the subtitles. Check your connection and try again. {d}",
    notVideo: 'The server did not return a video. Reload the page and try again.',
    done: 'Done.',
    mergeHint: 'Video and audio are separate files. Merge them with ffmpeg (run in Terminal):',
    tsHint: '.ts files play in VLC. Convert to MP4 (lossless):',
    stoppedLog: 'Stopped.',
    whileFetching: ' while fetching: {url}',
    hint400:
      'Tips: (1) Go back to the video tab, play a few seconds (so the extension learns the player headers), then click "Start download" again. ' +
      '(2) The link may have expired — reopen the popup to get a fresh playlist. ' +
      '(3) If it still fails, use the "MSE – Record" card in the popup.',
    playlistThis: 'This playlist · {n} segments · {type}',
    subsInPl: 'Subtitles in this playlist',

    saverTitle: 'Save MediaSource recording',
    preparing: 'Preparing…',
    keepOpen: 'Keep the video tab open until saving finishes.',
    save: 'Save',
    noRecorder: 'Recorder not found in the video tab (was it closed or reloaded?)',
    nothingRec: 'Nothing has been recorded.',
    trackName: '{mime} track · {size}',
    transferring: '→ Transferring {mime} track ({size})…',
    savedTo: '✔ Saved {name} ({size}) to Downloads',
    noInit: '⚠ Missing init segment — the file may not open (recorder attached late).',
    ffmpegMerge: 'Merge video + audio with ffmpeg (run in Terminal):',
    errStatus: 'Error.',
  },
};

export const LANGS = [
  ['vi', 'Tiếng Việt'],
  ['en', 'English'],
];

let lang = 'vi';

export async function initI18n() {
  try {
    const r = await chrome.storage.local.get('lang');
    lang = DICT[r.lang] ? r.lang : (navigator.language || '').toLowerCase().startsWith('vi') ? 'vi' : 'en';
  } catch {}
  applyI18n();
  return lang;
}

export const getLang = () => lang;

export async function setLang(l) {
  if (!DICT[l]) return;
  lang = l;
  try {
    await chrome.storage.local.set({ lang: l });
  } catch {}
  applyI18n();
}

export function t(key, vars) {
  let s = DICT[lang][key] ?? DICT.vi[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? '') + '');
  return s;
}

// Phần tử tĩnh trong HTML: data-i18n (text), data-i18n-html, data-i18n-title.
export function applyI18n(root = document) {
  document.documentElement.lang = lang;
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml);
  for (const el of root.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
}

// Ô chọn ngôn ngữ; gọi onChange sau khi đổi.
export function langSelect(onChange) {
  const sel = document.createElement('select');
  sel.className = 'lang';
  sel.title = t('language');
  for (const [v, label] of LANGS) sel.append(new Option(label, v));
  sel.value = lang;
  sel.addEventListener('change', async () => {
    await setLang(sel.value);
    sel.title = t('language');
    onChange?.(sel.value);
  });
  return sel;
}
