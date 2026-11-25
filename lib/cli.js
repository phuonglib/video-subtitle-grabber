// Dựng lệnh yt-dlp để dán vào Terminal. Tiêu đề và URL do trang web quyết định nên phải
// khử các ký tự mà shell sẽ thực thi ($(…), `…`, dấu nháy).
import { safeName } from './media.js';

export function quote(s, win = false) {
  const x = String(s).replace(/[\r\n\0]+/g, ' ');
  if (win) return `"${x.replace(/["$`!^]/g, '')}"`; // cmd và PowerShell
  return `'${x.replace(/'/g, `'\\''`)}'`; // macOS / Linux
}
const encUrl = (u) => String(u).replace(/["'`$!^\s]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));

/** page: true → url là trang xem video (yt-dlp tự tìm video), kèm phụ đề. */
export function ytdlpCommand({ url, title, ref = '', page = false, win = false }) {
  const a = ['yt-dlp'];
  if (!page && /^https?:/.test(ref)) a.push('--referer', quote(encUrl(ref), win));
  if (page) a.push('--no-playlist', '--write-subs', '--sub-langs', quote('vi,en', win));
  a.push('-o', quote(`${safeName(title).replace(/%/g, '%%')}.%(ext)s`, win), quote(encUrl(url), win));
  return a.join(' ');
}
