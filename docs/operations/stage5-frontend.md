# Stage 5 frontend — local

Frontend nối API Stage 5 qua các route BFF cố định, generated client, session cookie, chữ ký BFF và CSRF. Không triển khai production.

## Các màn hình

| Đường dẫn                                                       | Chức năng                                                                              |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `/app`                                                          | Tách điện thoại, danh tính thử nghiệm và quyền chủ xe; điều hướng theo quyền           |
| `/settings/verification`                                        | Tạo hồ sơ, tải ảnh tổng hợp, gửi/hủy, trạng thái sandbox và kết quả xét duyệt          |
| `/settings/vehicles`, `/settings/vehicles/:id`                  | Tạo/sửa xe, gửi duyệt, rút và lưu trữ; sửa xe đã duyệt cần xác nhận                    |
| `/communities`, `/communities/:id`                              | Danh mục có cursor, tìm tên trong trang đã tải, xin gia nhập/hủy/rời                   |
| `/settings/communities`                                         | Membership của tôi; vào chi tiết bằng community ID                                     |
| `/people`                                                       | Summary xe đã duyệt theo quyền xem hồ sơ; không hiển thị biển số/minh chứng            |
| `/admin`                                                        | Điều hướng quản trị, chặn UX khi thiếu ADMIN                                           |
| `/admin/verifications`, `/admin/vehicles`, `/admin/memberships` | Hàng đợi theo trạng thái, cursor, chi tiết, quyết định có lý do/xác nhận, cấm tự duyệt |
| `/admin/communities`                                            | Tạo/sửa/lưu trữ cộng đồng                                                              |
| `/admin/audit`                                                  | Tra cứu lịch sử theo loại và mã hồ sơ; deep link từ cộng đồng                          |

Chi tiết xác minh của admin có công cụ mock PASS/FAIL/PENDING/EXPIRED/TIMEOUT và retry khi hồ sơ đang chờ provider, chỉ hiển thị với `APP_ENV=local|test`. PASS vẫn cần admin duyệt. Backend tiếp tục là nơi kiểm tra quyền và môi trường.

Upload dùng chung với Stage 4: kiểm tra MIME/kích thước sơ bộ, presign → PUT không gửi credentials → complete kiểm tra ảnh ở backend. Chỉ nhận dữ liệu tổng hợp. Tối đa ba ảnh mới mỗi lần gửi. Ảnh bỏ chọn còn trong quản lý file và tuân theo retention. Không lưu URL minh chứng vào localStorage. Admin chỉ cấp URL sau thao tác rõ ràng có lý do; URL ngắn hạn, không preload ảnh.

Mutation dùng command UUID giữ nguyên trong bộ nhớ khi thử lại cùng payload sau lỗi mạng và `expectedVersion` cho cập nhật. Khi 409, tải lại dữ liệu, không tự gửi lại quyết định; form xét duyệt reset xác nhận khi phiên bản thay đổi. 429 hiển thị Retry-After. Dữ liệu pending được poll mỗi 7 giây, dừng khi terminal và không poll khi tab ở nền. Mutation refresh session và invalidate workflow; thay đổi auth từ tab khác cũng invalidate workflow.

## Demo với dịch vụ thật

1. Mở Docker Desktop, chạy `corepack pnpm dev` theo runbook backend.
2. Ở terminal khác chạy `corepack pnpm db:seed:stage5` (idempotent, local/test mock).
3. Mở hai browser context: đăng nhập mock **Sandbox Member** và **Sandbox Admin One**. Admin Two dùng thử đồng thời hoặc duyệt hồ sơ của Admin One.
4. Member vào profile, đọc/chấp nhận điều khoản hiện hành; vào xác minh tạo hồ sơ và tải PNG/JPEG/WebP tổng hợp, xác nhận rồi gửi.
5. Admin lọc “Chờ kết quả thử nghiệm”, mở hồ sơ và chạy “Đạt → chờ admin”. Chờ worker callback; xem minh chứng với lý do, duyệt với lý do và xác nhận. Member thấy danh tính thử nghiệm được duyệt.
6. Member tạo xe biển số `SYNTH-...`, tải ảnh tổng hợp mới và gửi. Admin duyệt rồi thu hồi; kiểm tra quyền chủ xe và chỉnh sửa/gửi lại bằng ảnh mới.
7. Member xin vào cộng đồng, admin duyệt/từ chối/thu hồi; thử hủy yêu cầu và rời. Thử lưu trữ cộng đồng rồi rời từ “Cộng đồng của tôi”. Cooldown hiển thị theo dữ liệu server.
8. Hai admin mở cùng hồ sơ, quyết định ở một context rồi gửi ở context còn lại: context sau phải nhận 409 và xem dữ liệu mới. Không tự duyệt chính mình.

## Kiểm thử

- `corepack pnpm --filter @dike/web test`: unit BFF/client, CSRF/origin, path injection, status/Retry-After, command retry và upload validation.
- `corepack pnpm --filter @dike/web exec playwright install chromium`: cài browser đúng phiên bản Playwright khi cần.
- `corepack pnpm test:e2e:stage5-ui`: browser UI **với API giả lập**, Next dev cổng 3100, không cần Docker. Kiểm tra guard, OTP/danh tính riêng, điều kiện gửi xe, review conflict reset, không preload evidence, membership phân trang và màn hình mobile.
- `corepack pnpm test:e2e:auth`, `corepack pnpm test:integration`: regression/kiểm thử dịch vụ thật, cần hạ tầng Docker.

UI giả lập không chứng minh tính đúng của Mongo transactions, MinIO, worker/webhook hoặc luồng hai người dùng với backend thật. Runtime acceptance Stage 5 vẫn phải hoàn tất khi Docker sẵn sàng; chưa coi toàn bộ Stage 5 đạt DoD chỉ nhờ build/unit/UI mock xanh.

## Kết quả kiểm tra ngày 2026-10-04

- `corepack pnpm run ci`: **đạt** (format, lint, typecheck, unit, build, API contract và secret scan). Các thay đổi cuối ở hook bảo vệ dữ liệu và browser tests được kiểm tra lint/format riêng, build và browser suite chạy trên source cuối.
- Unit toàn repo: **81 tests đạt**, trong đó web có **21 tests**.
- Browser UI với API giả lập: **7/7 đạt** trên Chromium, gồm trạng thái điện thoại/danh tính riêng, chặn admin, gửi ảnh/gửi hồ sơ, review 409 reset xác nhận, chặn tự duyệt/đọc ảnh thiếu lý do, membership ở trang sau/rời cộng đồng không khả dụng, ẩn hồ sơ cached khi refresh bị từ chối, bố cục mobile 390 px không tràn ngang.
- Đã xem ảnh chụp toàn trang phương tiện mobile sau khi chạy test.
- Docker Engine không khả dụng (`dockerDesktopLinuxEngine` pipe không tồn tại). Chưa nghiệm thu lại integration/E2E với dịch vụ thật trong đợt frontend này.
- Code local trên `codex/stage-5-frontend`; không deploy production.
