# Danh sách việc cuối cùng cho phụ huynh

Tất cả những việc cần con người làm, gom vào một chỗ. Đánh dấu khi xong.

## A. Nội dung câu hỏi (bắt buộc trước khi cho bé chơi)

- [ ] `npm run build-review`, mở `dist-review/index.html`, duyệt/loại từng câu (xem `docs/content-review.md`).
- [ ] Đối chiếu nghĩa tiếng Nhật với `content/work/authoring-notes-5.md` và `content/work/authoring-notes-4.md`. Câu nào có nghĩa sai hoặc khó hiểu thì loại.
- [ ] (Tùy chọn) Nếu dùng `npm run ai-approve`, ít nhất hãy xem lướt các câu "AI-approved" theo từng loại trong trang duyệt trước khi cho bé chơi (AI duyệt chưa có người kiểm tra nghĩa tiếng Nhật).
- [ ] Chép `approvals.json` vào `content/`, chạy `npm run build-content`, commit `public/content/5.json` và `4.json`. Hiện cả hai đang là `[]` nên bé thấy "もんだいを じゅんびちゅう".
- [ ] Mở góc phụ huynh, kiểm tra mục "Nội dung câu hỏi" cho số câu khác 0.

## B. Đưa lên mạng (GitHub Pages)

- [ ] **CẢNH BÁO trước push đầu tiên**: repository phải công khai, nhưng `docs/specs` và `docs/superpowers` mô tả về bé (tuổi, kế hoạch thi) và có đường dẫn `F:\` trên máy bạn. Khuyến nghị xóa hoặc chuyển hai thư mục ra khỏi repository trước khi push. Tùy chọn (chưa được chạy sẵn): `git rm -r --cached docs/specs docs/superpowers` rồi thêm vào `.gitignore` và commit; hoặc `move docs\specs ..\village-english-private\specs` và `move docs\superpowers ..\village-english-private\superpowers`. Lịch sử git cũ vẫn giữ các file đó: muốn sạch hẳn thì đẩy lên một repository mới chỉ có một commit.

- [ ] Tạo repository công khai `village-english` (không có bí mật nào trong mã; dữ liệu của bé không rời iPad).
- [ ] Đưa nhánh `build/initial` vào `main`, push.
- [ ] Settings > Pages > Source: "GitHub Actions".
- [ ] Lần chạy đầu của `.github/workflows/deploy.yml`: so phiên bản action, SHA và quyền với https://vite.dev/guide/static-deploy.html (file này được dựng lại theo ghi nhớ, chưa chạy thử).
- [ ] Mở địa chỉ `https://<tên-bạn>.github.io/village-english/` kiểm tra tải được, có icon và tên "むらのえいご".

## C. Thử trên iPad thật (`docs/device-checklist.md`)

- [ ] Thêm vào Màn hình chính; mở một lần khi có mạng; bật chế độ máy bay, mở lại, chơi hết một nhiệm vụ.
- [ ] Giọng đọc tiếng Anh và tiếng Nhật nghe được, nghe rõ; câu đầu tiên sau khi đổi câu hỏi có được đọc không.
- [ ] Giới hạn mỗi ngày dừng đúng giờ đã đặt.
- [ ] Xuất sao lưu, xóa dữ liệu trang web, nhập lại: dữ liệu quay về.
- [ ] Hình nhân vật nét trên màn hình 12.9"; nút đủ to cho bé bấm.
- [ ] Góc phụ huynh: tải file sao lưu trong chế độ ứng dụng thật sự lưu được; khóa 60 giây sau 5 lần sai PIN; tự khóa khi rời ứng dụng. Nếu bảng chia sẻ/chọn file làm góc phụ huynh khóa giữa chừng, báo lại để thêm thời gian chờ.
- [ ] Cập nhật: sau khi deploy bản mới, mở ứng dụng một lần khi có mạng, vuốt tắt hẳn ứng dụng, rồi mở lại mới thấy bản mới (`docs/pwa-update-policy.md`).

## D. Sao lưu và an toàn

- [ ] Tải file sao lưu đầu tiên ngay sau khi bé chơi vài hôm; cất ở nơi bé không lấy được (file này mở khóa được góc phụ huynh). Trên iPad hãy dùng nút "Chia sẻ / lưu vào Tệp", chuyển file sang máy tính hoặc iCloud của bạn và không để file nằm lại trên iPad của bé.
- [ ] Đặt mã PIN ngay ngày đầu tiên.
- [ ] Bật Thời gian sử dụng (Screen Time) của iPad với mật mã riêng, và bật ngày giờ tự động (Cài đặt > Cài đặt chung > Ngày & Giờ) để bé không chỉnh đồng hồ lách giới hạn chơi mỗi ngày.

## Những quyết định đã được đưa ra thay bạn

Hãy xem có đồng ý không; nếu không, mỗi mục chỉ là một thay đổi nhỏ.

1. **Nhân vật Taro đã bị bỏ** khỏi làng. Con cừu được đặt tên **Fuwa** và con ếch **Pyon** (ぴょん), vì "Keroppi" là tên nhân vật có bản quyền của Sanrio. Mã nội bộ vẫn là `keroppi`; đổi tên hiển thị chỉ là sửa một dòng.
2. **Góc phụ huynh bằng tiếng Việt**, màn hình của bé chỉ có tiếng Nhật. Toàn bộ chữ của góc phụ huynh nằm trong `src/ui/parent-strings.ts`, đổi ngôn ngữ chỉ cần sửa file đó.
3. **Trả lời sai không bị phạt**: bé thử lại đúng câu đó, không có bells cho lần sai, từ đó được ôn lại sớm hơn một lần, câu chỉ xong khi bé trả lời đúng. Không có chữ "sai/ざんねん" nào hiện ra.
4. **Giới hạn chơi mỗi ngày**: mặc định 30 phút (chỉnh được). Khi hết giờ bé thấy nhân vật buồn ngủ, vẫn vào được cửa hàng và trang trí làng. Nếu ai đó chỉnh đồng hồ iPad lùi lại, giới hạn vẫn được tính. Có nút "đặt lại thời gian chơi hôm nay" trong góc phụ huynh.
5. **Quên mã PIN**: khôi phục bằng file sao lưu (mã PIN cũ bị xóa, đặt mã mới). Ai có file sao lưu thì mở khóa được, nên hãy giữ file riêng tư. Không có sao lưu thì không lấy lại được PIN.
6. **Lần đầu tạo PIN có một phép tính nhỏ** (ví dụ 17 × 6) để bé không tự tạo mã trước bạn.
7. **Nội dung phải được bạn duyệt**: chỉ câu có trong `approvals.json` mới được phát hành. Phần nghĩa tiếng Nhật do người soạn tự viết, từ điển chỉ dùng để gợi ý (từ điển có lúc sai, ví dụ girl, milk, house, dog), nên bạn phải xem lại.
8. **Cấp 5 = toàn bộ từ A1, cấp 4 = nửa đầu từ A2** theo danh sách CEFR-J. Chỉ có 2 cấp này chơi được. Cấp 3 trở lên chưa có nội dung.
9. **Giá trong cửa hàng** chưa kiểm chứng: cả cửa hàng tốn 1.830 bells, một nhiệm vụ 5 câu kiếm tối đa khoảng 65 bells (khoảng 28 nhiệm vụ đầy đủ, vài ngày chơi). Nếu quá đắt hoặc quá rẻ, sửa bảng `PRICES` trong `src/domain/village.ts` sau khi bé chơi thử; thêm món mới thì cần có hình mới. Khi không đủ bells, bé chỉ thấy câu trung tính 「ベルが たりないよ」.
10. **Cập nhật ứng dụng không tự chen vào lúc bé đang chơi**: bản mới có hiệu lực sau khi tắt hẳn ứng dụng và mở lại.
11. **Giọng đọc** dùng giọng có sẵn của iPad; chưa nghe thử trên thiết bị thật. Mọi thông báo cho bé (câu hỏi, lời nhắn ở bản đồ, cửa hàng, trang trí...) đều được đọc thành tiếng sau lần chạm đầu tiên.
    **Dân làng**: làng hiện 6 bạn mỗi ngày, xoay vòng theo ngày để cả 11 bạn đều xuất hiện; màn hình hết giờ luôn là Fuwa buồn ngủ.
12. **Một số ghi chú nhỏ của nội dung** (không chặn việc phát hành): vài hình dùng emoji gần đúng (mũ là mũ nắng, "orange" là vòng tròn màu), một số câu điền từ dùng từ gợi ý ngoài danh sách, vài câu hội thoại hơi giống bài ngữ pháp. Xem phần "minor" trong các ghi chú soạn thảo nếu muốn chỉnh.
13. **Không có tên kỳ thi** ở bất cứ chỗ nào bé hay bạn nhìn thấy trong ứng dụng (`docs/allowed-eiken-mentions.md`).
14. **Repo công khai**: ai cũng xem được mã và nội dung câu hỏi (đều là tài liệu có giấy phép mở, liệt kê ở trang Credits). Dữ liệu của bé không bao giờ được gửi lên.
