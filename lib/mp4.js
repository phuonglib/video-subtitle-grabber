// Đọc thời lượng từ hộp mvhd ở đầu file MP4 (không cần tải cả file).
export function mvhdDuration(u8) {
  for (let i = 4; i + 36 < u8.length; i++) {
    if (u8[i] !== 0x6d || u8[i + 1] !== 0x76 || u8[i + 2] !== 0x68 || u8[i + 3] !== 0x64) continue;
    const v = new DataView(u8.buffer, u8.byteOffset + i + 4, 32);
    const v1 = v.getUint8(0) === 1;
    const scale = v.getUint32(v1 ? 20 : 12);
    const dur = v1 ? Number(v.getBigUint64(24)) : v.getUint32(16);
    return scale ? dur / scale : 0;
  }
  return 0;
}
