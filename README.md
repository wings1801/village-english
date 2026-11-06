# Làng Tiếng Anh (village-english)

Trò chơi học tiếng Anh cho bé trên iPad: bé sống trong một ngôi làng thú dễ thương, làm nhiệm vụ cùng các bạn thú để kiếm "bells" và trang trí làng. Chạy trên trình duyệt, cài lên màn hình chính như một ứng dụng và dùng được khi không có mạng. Màn hình của bé hoàn toàn bằng tiếng Nhật; góc phụ huynh bằng tiếng Việt. Dữ liệu của bé chỉ nằm trên chính chiếc iPad, không gửi đi đâu.

Công nghệ: Preact + TypeScript + Vite (PWA). Không có quảng cáo, không phân tích, không gọi mạng ngoài các file tĩnh của chính ứng dụng.

## Đã làm xong

- Làng, 7 đảo (hiện chơi được 2 đảo: cấp 5 và cấp 4), 5 trò chơi nhỏ, giọng đọc, thưởng bells, cửa hàng và trang trí làng.
- Giới hạn chơi mỗi ngày (có nút đặt lại trong góc phụ huynh), góc phụ huynh có mã PIN, thống kê, sao lưu và khôi phục.
- Trang ghi công và giấy phép (Credits) luôn có nút để mở.
- Công cụ duyệt câu hỏi (có hình minh họa, lưu quyết định, mã băm chống duyệt nhầm câu đã sửa), workflow deploy GitHub Pages, bộ test đơn vị và e2e đều xanh.

## Bạn cần làm gì để bắt đầu

1. **Cài đặt**: cài Node 22 trở lên (https://nodejs.org), mở terminal trong thư mục dự án, chạy `npm install`.
2. **Thử trên máy tính**:
   - `npm run dev` rồi mở địa chỉ hiện ra (thường `http://localhost:5173/village-english/`).
   - `npm test` chạy các test đơn vị.
   - `npx playwright install webkit` (một lần), sau đó `npm run e2e` chạy test giả lập iPad.
3. **Duyệt câu hỏi** (bắt buộc, hiện chưa có câu nào được phát hành, bé sẽ thấy "もんだいを じゅんびちゅう"):
   - `npm run build-review`, mở `dist-review/index.html`, bấm duyệt hoặc loại từng câu, tải `approvals.json`, chép vào thư mục `content/`, rồi `npm run build-content`.
   - Trang duyệt có bộ lọc và nút duyệt/loại hàng loạt cho các câu đang hiện. Tùy chọn (mặc định tắt): `npm run ai-approve` cho AI duyệt các câu chưa có quyết định sau kiểm tra tự động; các câu này được đánh dấu "AI-approved" và chưa có người kiểm tra nghĩa tiếng Nhật, nên ít nhất hãy xem lướt theo từng loại câu trước khi cho bé chơi.
   - Hướng dẫn chi tiết: `docs/content-review.md`.
   - Đọc kèm `content/work/authoring-notes-5.md` và `content/work/authoring-notes-4.md` (nghĩa tiếng Nhật của từng từ). Nghĩa nào sai thì phải loại câu đó, đừng duyệt.
4. **Đưa lên GitHub Pages**:
   - **CẢNH BÁO trước khi push lần đầu**: repository phải công khai, mà hai thư mục `docs/specs` và `docs/superpowers` mô tả về bé (tuổi, kế hoạch thi) và chứa đường dẫn máy cục bộ dạng `F:\`. Nên xóa hoặc chuyển hai thư mục này ra khỏi repository trước khi push. Bước tùy chọn (hãy tự chạy khi đã sẵn sàng, các lệnh chưa được chạy):
     - Giữ bản trên máy nhưng không đưa vào git: `git rm -r --cached docs/specs docs/superpowers`, rồi thêm hai dòng `docs/specs/` và `docs/superpowers/` vào `.gitignore` và commit.
     - Hoặc chuyển hẳn ra ngoài dự án: `move docs\specs ..\village-english-private\specs` và `move docs\superpowers ..\village-english-private\superpowers` (Windows), rồi `git add -A` và commit.
     - Lịch sử git cũ vẫn còn các file đó; nếu bạn muốn xóa sạch cả lịch sử, hãy tạo repository mới từ cây thư mục đã dọn (một commit duy nhất) thay vì đẩy nhánh hiện tại.
   - Tạo repository **công khai (public)** tên `village-english` (gói miễn phí của GitHub chỉ cho Pages với repo công khai; trang web ai cũng truy cập được, còn dữ liệu của bé không bao giờ rời iPad).
   - Đưa nhánh `build/initial` vào nhánh `main` (workflow chạy khi có push vào `main`), rồi push.
   - Trên GitHub: Settings > Pages > Source chọn "GitHub Actions".
   - Workflow là `.github/workflows/deploy.yml`. File này được dựng lại theo tài liệu, hãy so phiên bản action, mã SHA và quyền với https://vite.dev/guide/static-deploy.html ở lần chạy đầu.
   - Địa chỉ sẽ là `https://<tên-bạn>.github.io/village-english/`.
5. **Cài lên iPad**: mở địa chỉ trên bằng Safari > nút Chia sẻ > "Thêm vào Màn hình chính" (bật "Mở như ứng dụng web" nếu có). Mở ứng dụng một lần khi có mạng, sau đó bật chế độ máy bay để thử xem còn chơi được không.
6. **Kiểm tra trên iPad thật**: làm theo `docs/device-checklist.md` (giọng đọc, ngoại tuyến, sao lưu, kích thước nút...). Danh sách tổng hợp mọi việc cần người: `docs/final-checklist.md`.
7. **Khuyến nghị an toàn** (làm ngay ngày đầu):
   - Đặt mã PIN của góc phụ huynh ngay ngày đầu tiên.
   - Bật Thời gian sử dụng (Screen Time) của iPad với mật mã riêng, và để ngày giờ ở chế độ tự động (Cài đặt > Cài đặt chung > Ngày & Giờ > Đặt tự động), để bé không chỉnh đồng hồ lách giới hạn thời gian chơi. Đồng hồ chỉnh tiến lên vẫn có thể làm hỏng giới hạn; hai cài đặt này là cách chặn chính.
   - Không để file sao lưu trên iPad: bé có thể dùng nó ở "Quên mã PIN?" để mở khóa góc phụ huynh. Trên iPad hãy dùng nút "Chia sẻ / lưu vào Tệp" rồi chuyển file sang máy tính hoặc iCloud của bạn và xóa bản trên iPad.
8. **Sao lưu và quên mã PIN**: trong góc phụ huynh, mục "Sao lưu" tải file `village-english-backup-NĂM-THÁNG-NGÀY.json` (nên làm vài tuần một lần, cất ở iCloud Drive hoặc máy tính). Quên PIN thì ở màn hình PIN bấm "Quên mã PIN?" và chọn file sao lưu: dữ liệu được khôi phục, mã PIN cũ bị xóa và bạn đặt mã mới. Không có file sao lưu thì không lấy lại được PIN. Chi tiết: `docs/content-review.md`.
9. **Hạn chế đã biết**:
   - Chất lượng giọng đọc trên iPad thật chưa được kiểm chứng.
   - Chưa chơi được cấp 3 trở lên (chỉ cấp 5 và cấp 4).
   - Giá trong cửa hàng có thể cần chỉnh sau khi bé chơi thử: cả cửa hàng (24 món) tốn 1.830 bells; một nhiệm vụ 5 câu kiếm tối đa khoảng 65 bells (tức khoảng 28 nhiệm vụ đầy đủ, vài ngày chơi). Muốn đổi giá, sửa bảng `PRICES` trong `src/domain/village.ts`. Muốn thêm món mới thì cần có hình mới (thêm vào `src/assets/manifest.ts` và `public/assets/decor/`), không chỉ thêm giá.
   - Tên ứng dụng không được chứa tên kỳ thi (nhãn hiệu); hiện tại không có chỗ nào chứa.
   - Cập nhật phiên bản mới chỉ có hiệu lực sau khi tắt hẳn ứng dụng và mở lại (`docs/pwa-update-policy.md`).

## Cấu trúc thư mục

- `src/` mã nguồn; `tests/` test; `public/` hình, icon và `content/*.json` (câu hỏi đã duyệt).
- `content/` câu hỏi gốc, `approvals.json`, nguồn dữ liệu; `scripts/` công cụ tạo nội dung.
- `docs/` tài liệu (thiết kế, kế hoạch, hướng dẫn duyệt, danh sách kiểm tra).
