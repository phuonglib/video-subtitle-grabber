// Kéo dữ liệu bản ghi MSE từ trang về extension theo từng phần (base64 data URL),
// ghép lại thành Blob. `call(method, args)` gọi một hàm của window.__vd trong frame.

import { t } from './i18n.js';

export const PART_SIZE = 4 * 1024 * 1024;

export async function pullTrack(call, id, onProgress, signal) {
  const info = await call('prepare', [id]);
  if (!info) return null;
  const parts = [];
  let done = 0;
  try {
    for (let start = 0; start < info.size; start += PART_SIZE) {
      if (signal?.aborted) throw new Error(t('stopped'));
      const end = Math.min(info.size, start + PART_SIZE);
      const dataUrl = await call('readPart', [id, start, end]);
      if (typeof dataUrl !== 'string') throw new Error(t('readFail'));
      const buf = await (await fetch(dataUrl)).arrayBuffer();
      if (buf.byteLength !== end - start) throw new Error(t('missingData', { got: buf.byteLength, want: end - start }));
      parts.push(buf);
      done = end;
      onProgress?.(done, info.size);
    }
  } finally {
    try {
      await call('release', [id]);
    } catch {}
  }
  return { info, blob: new Blob(parts, { type: info.type }) };
}
