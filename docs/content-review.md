# Duyệt nội dung câu hỏi và sao lưu (dành cho phụ huynh)

Câu hỏi chỉ xuất hiện trong trò chơi sau khi phụ huynh đã duyệt. Nếu mục "Nội dung câu hỏi" trong góc phụ huynh báo 0 câu, nghĩa là chưa có gì được duyệt.

## Quy trình duyệt

1. Mở terminal trong thư mục dự án và chạy `npm run build-review`.
2. Mở file `dist-review/index.html` bằng trình duyệt (mở trực tiếp từ thư mục `dist-review/` nằm trong dự án; các hình minh họa được đọc từ `../public/assets/emoji/` theo đường dẫn tương đối, nên đừng chép trang này đi nơi khác). Trang liệt kê từng câu hỏi kèm phần giải thích tiếng Nhật và hình minh họa để bạn kiểm tra hình có đúng không.
3. Với mỗi câu, bấm duyệt (approve) hoặc loại (reject). Có thể làm nhiều lần: các quyết định được lưu trong trình duyệt (localStorage) và hiện lại khi mở lại trang. Trên đầu trang có bộ đếm (đã duyệt / đã loại / chưa quyết), ô "Undecided only" để chỉ xem câu chưa quyết, và nút "Load approvals.json" để nạp lại file `approvals.json` đã tải trước đó (các quyết định được gộp vào, không ghi đè những gì đã làm).
4. Khi xong, bấm "Download approvals.json" và chép đè vào thư mục `content/` (thay file `content/approvals.json` cũ). Mỗi quyết định mang theo một mã băm (hash) của nội dung câu hỏi lúc bạn duyệt.
5. Chạy `npm run build-content`. Lệnh này kiểm tra dữ liệu rồi tạo file câu hỏi đã duyệt cho từng cấp. Nếu một câu đã duyệt bị sửa sau đó, lệnh dừng với lỗi `stale approval for <id>: the question changed after it was approved — review it again`: hãy chạy lại `npm run build-review`, duyệt lại câu đó (quyết định cũ của câu đã sửa tự bị bỏ), tải `approvals.json` mới. `npm run validate-content` cũng kiểm tra điều này.
6. Triển khai lại (deploy) ứng dụng. Trên iPad: mở ứng dụng một lần khi có mạng, rồi vuốt tắt hẳn ứng dụng (vuốt lên trong bộ chuyển ứng dụng), rồi mở lại. Bản mới chỉ có hiệu lực sau khi ứng dụng được tắt hẳn và mở lại (`docs/pwa-update-policy.md`).

## Ghi chú soạn câu hỏi

Các ghi chú soạn thảo kèm chú giải tiếng Nhật nằm ở:

- `content/work/authoring-notes-5.md` (cấp 5)
- `content/work/authoring-notes-4.md` (cấp 4)

Hãy đọc các file này khi cần hiểu vì sao một câu được viết như vậy.

## Sao lưu dữ liệu của bé

- Trong góc phụ huynh, mục "Sao lưu", bấm "Tải file sao lưu" để lưu file `village-english-backup-NĂM-THÁNG-NGÀY.json`. Nên làm vài tuần một lần và cất file ở nơi an toàn (iCloud Drive hoặc máy tính).
- "Khôi phục từ file" sẽ thay toàn bộ dữ liệu hiện tại bằng dữ liệu trong file. Ứng dụng luôn hỏi lại trước khi thay.
- Quên mã PIN: ở màn hình nhập PIN, bấm "Quên mã PIN?" rồi chọn một file sao lưu. Khi khôi phục, mã PIN cũ bị xóa và bạn đặt mã mới. Nếu không có file sao lưu thì không thể lấy lại mã PIN, vì vậy hãy tải sao lưu sớm.
- Lưu ý: file sao lưu có thể mở khóa góc phụ huynh (như một chìa khóa vạn năng) vì khôi phục từ file sẽ xóa mã PIN. Hãy giữ file riêng tư, không để bé lấy được.
- Trên iPad, nên dùng nút "Chia sẻ / lưu vào Tệp" để lưu bản sao lưu (rồi chuyển file sang máy tính hoặc iCloud, đừng để file nằm lại trên iPad của bé).
- Mục "Tình trạng lưu trữ" cảnh báo khi iPad có thể không giữ được dữ liệu. Khi thấy cảnh báo, hãy tải file sao lưu ngay.
