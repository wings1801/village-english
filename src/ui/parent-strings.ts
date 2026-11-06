/**
 * Every visible string of the parent corner lives here (Vietnamese), so the language can be swapped in
 * one file. The components under src/ui/parent*.tsx and src/ui/pin-gate.tsx must not hard-code text
 * (tests/parent-strings.spec.tsx enforces it).
 */
import type { GradeId } from '../domain/grades';

const GRADE_NAMES: Record<GradeId, string> = {
  '5': '5級',
  '4': '4級',
  '3': '3級',
  p2: '準2級',
  '2': '2級',
  p1: '準1級',
  '1': '1級',
};

export const vi = {
  // ----- common
  backToVillage: 'Quay về làng',
  cancel: 'Hủy',
  confirm: 'Đồng ý',
  loading: 'Đang tải…',
  gradeName: (g: GradeId): string => GRADE_NAMES[g],

  // ----- keypad
  keypad: {
    label: 'Bàn phím số',
    digit: (d: string): string => `Số ${d}`,
    backspace: 'Xóa số cuối',
    enter: 'Xác nhận',
    dots: (n: number, of: number): string => `Đã nhập ${n} trên ${of} chữ số`,
    answerBox: 'Câu trả lời',
  },

  // ----- no usable store
  noStore: {
    title: 'Không thể lưu dữ liệu trên thiết bị này',
    body: 'Trình duyệt không cho phép lưu trữ dữ liệu (IndexedDB không dùng được). Ứng dụng vẫn chạy, nhưng tiến độ học, chuông và mã PIN sẽ mất khi đóng trang.',
    effect: 'Vì vậy việc tạo mã PIN và sao lưu đang bị tắt. Hãy thử mở ứng dụng bằng Safari ở chế độ thường (không phải chế độ riêng tư) hoặc thêm vào Màn hình chính.',
  },

  // ----- gate: arithmetic check
  arith: {
    title: 'Góc dành cho phụ huynh',
    question: (a: number, b: number): string => `Để tiếp tục, hãy tính: ${a} × ${b} = ?`,
    wrong: 'Chưa đúng. Hãy thử lại với phép tính mới.',
  },

  // ----- gate: create PIN
  create: {
    title: 'Tạo mã PIN',
    enterNew: 'Nhập mã PIN mới gồm 4 chữ số',
    enterAgain: 'Nhập lại mã PIN một lần nữa',
    mismatch: 'Hai lần nhập chưa giống nhau. Hãy thử lại từ đầu.',
    saveFailed: 'Không lưu được mã PIN. Hãy thử lại.',
    hint: 'Mã PIN dùng để mở góc phụ huynh. Hãy nhớ kỹ mã này.',
  },

  // ----- gate: login
  login: {
    title: 'Nhập mã PIN',
    prompt: 'Nhập mã PIN gồm 4 chữ số',
    wrong: 'Mã PIN chưa đúng.',
    locked: (secs: number): string => `Nhập sai quá nhiều lần. Hãy thử lại sau ${secs} giây.`,
    /** Spoken once when the lock starts (the per-second number is not announced). */
    lockedAnnounce: 'Nhập sai quá nhiều lần. Bàn phím bị khóa 60 giây.',
    /** Spoken once when the lock ends. */
    unlockedAgain: 'Đã hết thời gian khóa. Bạn có thể nhập lại.',
    forgot: 'Quên mã PIN?',
  },

  // ----- gate: forgotten PIN
  recover: {
    title: 'Quên mã PIN',
    explain:
      'Khi khôi phục từ một file sao lưu, mã PIN sẽ được xóa và bạn có thể đặt mã mới. Dữ liệu hiện tại trên thiết bị này sẽ được thay bằng dữ liệu trong file.',
    privacy: 'Lưu ý: file sao lưu có thể mở khóa góc phụ huynh (như một chìa khóa vạn năng). Hãy giữ file riêng tư và đừng để bé lấy được.',
    needFile: 'Bạn cần một file sao lưu đã tải trước đó (tên dạng village-english-backup-…json).',
    pick: 'Chọn file sao lưu',
    working: 'Đang khôi phục…',
    done: 'Đã khôi phục dữ liệu. Hãy đặt mã PIN mới.',
    back: 'Quay lại',
  },

  // ----- dashboard
  dash: {
    title: 'Góc phụ huynh',
    lock: 'Khóa lại và quay về làng',
    loadFailed: 'Không đọc được dữ liệu. Hãy thử lại.',
  },

  today: {
    title: 'Hôm nay',
    played: (m: number, limit: number): string => `Đã chơi ${m}/${limit} phút`,
    barLabel: (m: number, limit: number): string => `Đã chơi ${m} trên ${limit} phút`,
    reset: 'Đặt lại thời gian chơi hôm nay',
    confirmTitle: 'Đặt lại thời gian chơi hôm nay?',
    confirmBody: 'Thời gian đã chơi hôm nay sẽ về 0 phút để bé có thể chơi tiếp.',
    confirmYes: 'Đặt lại',
    done: 'Đã đặt lại thời gian chơi hôm nay.',
    failed: 'Không đặt lại được. Hãy thử lại.',
  },

  week: {
    title: '7 ngày gần nhất',
    chart: (items: { dateKey: string; minutes: number }[]): string =>
      `Số phút chơi mỗi ngày: ${items.map((i) => `${i.dateKey.slice(8)}/${i.dateKey.slice(5, 7)} ${i.minutes} phút`).join(', ')}`,
    day: (dateKey: string): string => `${dateKey.slice(8)}/${dateKey.slice(5, 7)}`,
    total: (m: number): string => `Tổng cộng: ${m} phút`,
  },

  weak: {
    title: 'Từ hay sai',
    empty: 'Chưa có từ nào hay sai. Khi bé chơi thêm, các từ khó sẽ hiện ở đây.',
    wrong: (wrong: number, seen: number): string => `sai ${wrong}/${seen} lần`,
  },

  progress: {
    title: 'Tiến độ theo cấp',
    soon: 'sắp có',
    total: 'Tổng số từ',
    seen: 'Đã gặp',
    mastered: 'Đã thuộc',
    unknown: 'Chưa có danh sách từ.',
    bar: (g: GradeId, seen: number, mastered: number, total: number): string =>
      `${GRADE_NAMES[g]}: đã gặp ${seen}, đã thuộc ${mastered} trên tổng ${total} từ`,
  },

  content: {
    title: 'Nội dung câu hỏi',
    count: (n: number): string => `${n} câu hỏi đã duyệt`,
    none: 'Nội dung chưa được duyệt, nên cấp này chưa có câu hỏi. Xem hướng dẫn duyệt nội dung trong file docs/content-review.md.',
    byWho: (parent: number, ai: number): string => `${parent} câu do bạn duyệt, ${ai} câu do AI duyệt (chưa có người xem)`,
    aiNoticeTitle: 'Có câu hỏi do AI duyệt',
    aiNotice:
      'Các câu do AI duyệt đã qua kiểm tra tự động và các lần AI rà soát trước đó, nhưng chưa có người kiểm tra nghĩa tiếng Nhật. Nên xem lại chúng bằng trang duyệt (npm run build-review): chọn bộ lọc "AI-approved" để xem và sửa.',
  },

  settings: {
    title: 'Cài đặt',
    limit: 'Giới hạn thời gian chơi mỗi ngày',
    minutes: (m: number): string => `${m} phút`,
    less: 'Giảm 5 phút',
    more: 'Tăng 5 phút',
    limitSaved: 'Đã lưu giới hạn thời gian.',
    grade: 'Cấp độ hiện tại của bé',
    gradeSaved: 'Đã lưu cấp độ.',
    changePin: 'Đổi mã PIN',
    pinChanged: 'Đã đổi mã PIN.',
    changePinTitle: 'Đổi mã PIN',
    currentPin: 'Nhập mã PIN hiện tại',
    saveFailed: 'Không lưu được cài đặt. Hãy thử lại.',
  },

  backup: {
    title: 'Sao lưu',
    explain:
      'File sao lưu chứa toàn bộ tiến độ, chuông và đồ trang trí. Nên tải về thỉnh thoảng và cất ở nơi an toàn (iCloud Drive, máy tính).',
    download: 'Tải file sao lưu',
    downloaded: 'Đã tạo file sao lưu.',
    restore: 'Khôi phục từ file',
    restoreTitle: 'Khôi phục từ file sao lưu?',
    restoreBody: 'Dữ liệu hiện tại sẽ bị thay thế bằng dữ liệu trong file. Không thể hoàn tác.',
    restoreAll: 'Việc khôi phục sẽ thay thế TẤT CẢ dữ liệu và cả mã PIN hiện tại.',
    pinNone: 'File này không có mã PIN: mã PIN sẽ bị xóa và ứng dụng sẽ yêu cầu đặt mã mới.',
    pinFromFile: 'File này có mã PIN: sau khi khôi phục sẽ dùng mã PIN trong file.',
    restoreYes: 'Khôi phục',
    share: 'Chia sẻ / lưu vào Tệp',
    shared: 'Đã mở bảng chia sẻ cho file sao lưu.',
    shareFailed: 'Không chia sẻ được file sao lưu. Hãy thử nút Tải file sao lưu.',
    restored: 'Đã khôi phục dữ liệu. Ứng dụng sẽ tải lại ngay.',
    exportFailed: 'Không tạo được file sao lưu.',
    errEmpty: 'File trống. Hãy chọn file sao lưu khác.',
    errTooLarge: 'File quá lớn nên không phải file sao lưu của ứng dụng.',
    errNotJson: 'File này không đọc được. Hãy chọn file sao lưu của ứng dụng.',
    errInvalid: (what: string): string =>
      `File này không phải file sao lưu hợp lệ của ứng dụng (lỗi: ${what}). Dữ liệu hiện tại không thay đổi.`,
    errOther: 'Không khôi phục được. Dữ liệu hiện tại không thay đổi.',
    errRead: 'Không đọc được file. Hãy thử lại.',
  },

  storage: {
    title: 'Tình trạng lưu trữ',
    ok: 'Việc lưu dữ liệu đang hoạt động bình thường.',
    problem: 'Có thể dữ liệu chưa được lưu an toàn trên thiết bị này.',
    reason: (r: string): string => `Chi tiết: ${r}`,
    advice: 'Hãy tải file sao lưu ngay để không mất tiến độ của bé.',
    persisted: 'Trình duyệt đã đồng ý giữ dữ liệu lâu dài.',
    notPersisted:
      'Trình duyệt chưa cam kết giữ dữ liệu lâu dài. Nếu máy hết dung lượng, dữ liệu có thể bị xóa, nên hãy sao lưu thỉnh thoảng.',
  },
} as const;
