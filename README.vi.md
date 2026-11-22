<p align="center">
  <img src="icons/icon512.png" alt="Logo Video & Subtitle Grabber" width="128" height="128">
</p>

<h1 align="center">Video & Subtitle Grabber</h1>

<p align="center">
  Extension Chrome (Manifest V3) phát hiện video đang phát trên trang và lưu cùng phụ đề.
  <br>
  Tiếng Việt · <a href="README.md">English</a>
</p>

---

## Tính năng

- **Bắt media khi đang phát:** file MP4/WebM, luồng HLS (`.m3u8`), DASH (`.mpd`) và phụ đề. Phụ đề có thể là file VTT/SRT, thẻ `<track>`, hoặc phần đã nạp sẵn trong trình phát.
- **Nhận ra playlist ngụy trang:** extension soi nội dung fetch/XHR, nên vẫn tìm được playlist không có đuôi `.m3u8` hoặc nạp từ `blob:`.
- **Chọn đúng video đang phát:** các playlist trùng (cùng đường dẫn, khác token) và playlist con được gộp lại. Video hoạt động gần nhất được đánh dấu **▶ Đang phát**, các video khác được thu gọn bên dưới.
- **Mỗi ngôn ngữ 1 phụ đề:** phụ đề của video đang phát được ưu tiên. Các đoạn phụ đề HLS được gộp thành 1 file, phần còn lại được thu gọn.
- **Sửa tên trước khi lưu:** bạn sửa được tên file video và tên từng file phụ đề. Phụ đề đặt theo tên video (`bai-1.vi.srt`) để VLC hoặc IINA tự nhận.
- **Mặc định tải video kèm phụ đề:** chọn *Chỉ video* hoặc *Chỉ phụ đề* khi chỉ cần một loại.
- **Trang tải HLS:** chọn chất lượng và audio riêng, tải song song các đoạn, ghép thành `.ts` hoặc `.mp4`, chuyển phụ đề sang SRT hoặc VTT.
- **Ghi luồng MediaSource:** phương án dự phòng cho player phát qua `blob:` mà không có link tải. Extension chép lại dữ liệu player nạp vào trong lúc video chạy.
- **Giao diện 2 ngôn ngữ:** Tiếng Việt và English. Font Be Vietnam Pro được đóng gói sẵn nên chạy được offline.

## Cài đặt

1. Tải hoặc clone repo này về máy.
2. Mở `chrome://extensions` và bật **Developer mode** (góc phải trên).
3. Bấm **Load unpacked**, chọn thư mục dự án.
4. Ghim extension lên thanh công cụ.
5. Nên làm thêm: bấm **Chi tiết** ở extension, mục **Quyền truy cập trang web** chọn **Trên tất cả các trang web**. Như vậy extension thấy được cả video nhúng từ trang khác.

## Cách dùng

1. Mở trang có video và **bấm phát video**. Nếu trang được mở trước khi cài extension, hãy tải lại trang trước.
2. Bấm biểu tượng extension. Số trên biểu tượng là số media đã bắt được.
3. Chọn mục cần tải:

| Mục | Thao tác |
|---|---|
| MP4 / WebM | **Tải xuống…** mở hộp thoại: sửa tên file, chọn SRT/VTT, chọn *Video + phụ đề* hoặc *Chỉ video*. |
| HLS (`.m3u8`) | **Tải xuống…** mở trang tải: chọn chất lượng, audio và tên file, rồi bấm **Bắt đầu tải**. Giữ tab đó mở cho tới khi tải xong. |
| Phụ đề | **Tải xuống…** cho phép sửa tên và chọn định dạng. |
| DASH (`.mpd`) | Bấm **Copy lệnh yt-dlp** rồi chạy trong Terminal. |
| Ghi luồng MSE | Chọn tốc độ, bấm **● Ghi từ đầu**, để video chạy hết (không tua), rồi bấm **■ Dừng & lưu…**. |

Nếu video và audio ra 2 file riêng, ghép lại bằng [ffmpeg](https://ffmpeg.org/):

```bash
ffmpeg -i ten.video.mp4 -i ten.audio.m4a -c copy ten.mp4
```

Phần giải thích cấu trúc code nằm trong [README tiếng Anh](README.md#how-it-works).

## Giới hạn (cố ý)

- **Không phá DRM và không giải mã.** Luồng có Widevine, PlayReady, FairPlay, hoặc HLS mã hóa AES-128/SAMPLE-AES sẽ được báo là không hỗ trợ. Pull request thêm tính năng gỡ DRM hoặc giải mã sẽ không được chấp nhận.
- Link đoạn video có chữ ký dùng một lần (hết hạn ngay khi player dùng xong) không tải lại được. Extension không phân tích ngược cơ chế token của trang.
- YouTube tách video/audio và thay chữ ký URL liên tục, nên hãy dùng [yt-dlp](https://github.com/yt-dlp/yt-dlp).
- Luồng HLS được ghép trong RAM, nên video rất dài (hơn khoảng 2 GB) có thể làm tab hết bộ nhớ.

## Sử dụng có trách nhiệm

Chỉ dùng để lưu nội dung bạn có quyền giữ: nội dung của chính bạn, nội dung theo giấy phép mở, hoặc được chủ sở hữu cho phép tải. Hãy tôn trọng luật bản quyền và điều khoản của từng trang. Bạn tự chịu trách nhiệm về cách sử dụng công cụ này.

## Giấy phép

Mã nguồn theo giấy phép [MIT](LICENSE). Font [Be Vietnam Pro](https://github.com/bettergui/BeVietnamPro) đi kèm theo [SIL Open Font License 1.1](fonts/OFL.txt).
