// Trang một-trang (SPA) đổi URL mà không tải lại. Chỉ đổi query/hash → vẫn là video đó.
export function samePage(a, b) {
  try {
    const x = new URL(a), y = new URL(b);
    return x.origin === y.origin && x.pathname.replace(/\/+$/, '') === y.pathname.replace(/\/+$/, '');
  } catch {
    return false;
  }
}

export const NAV_GRACE = 8000; // trang SPA thường tải phụ đề ngay trước khi đổi URL

/**
 * Trang vừa đổi sang newUrl. Trả về mốc thời gian: mục thấy trước mốc này là của trang cũ (0 = giữ hết).
 * mainAt: lúc trình duyệt thật sự tải trang mới (request main_frame), nếu có.
 */
export function navCut({ oldUrl, newUrl, now, mainAt = 0 }) {
  if (mainAt && now - mainAt < 30000) return mainAt;
  if (!oldUrl || samePage(oldUrl, newUrl)) return 0;
  return now - NAV_GRACE;
}
