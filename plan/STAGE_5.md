# Stage 5 — Kế hoạch local: eKYC sandbox, phương tiện, cộng đồng và UI admin

Backend đã có triển khai local. Frontend FE-00–FE-04 đã được triển khai trên nhánh `codex/stage-5-frontend`, gồm BFF, màn hình thành viên và admin, upload dùng chung, xử lý version/idempotency và kiểm thử UI giả lập. Xem [runbook backend](../docs/operations/stage5-backend.md) và [runbook frontend](../docs/operations/stage5-frontend.md). Nghiệm thu tích hợp/E2E với dịch vụ thật vẫn chờ Docker; chưa đóng DoD toàn bộ Stage 5. Các phần phân tích nền bên dưới ghi lại thời điểm lập kế hoạch, không phải trạng thái source hiện tại.

## 1. Mục tiêu và phạm vi

Kế hoạch dựa trên source nhánh `main`, HEAD `e2ea3af`, và mục Giai đoạn 5 trong [PLAN.md](PLAN.md). Đây là kế hoạch triển khai, chưa phải chức năng đã hoàn thành. Ưu tiên local với MongoDB replica set, Redis, MinIO và mock OIDC đang có; chưa triển khai production hay tích hợp nhà cung cấp eKYC thật.

Kết quả cần đạt: thành viên gửi hồ sơ xác minh tổng hợp, nhận kết quả sandbox, admin duyệt/từ chối qua UI; thành viên đăng ký phương tiện và xin vào cộng đồng; quyền hiệu lực thay đổi ngay theo kết quả duyệt. Không phải sửa database thủ công để demo các luồng.

Ngoài phạm vi: OCR/liveness thật, giấy tờ người thật, Goong, lịch, bài đăng, tạo chuyến, booking, bạn bè/chặn, chat/socket và hệ thống moderation tổng quát. Các endpoint bài/chuyến thuộc Stage 9–10; Stage 5 chuẩn bị policy và kiểm thử quyền, không tạo endpoint giả để tuyên bố hoàn thành các stage sau.

## 2. Kết quả rà source hiện tại

| Thành phần     | Đã có trong source                                                                                     | Khoảng trống cần xử lý                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth/roles     | `authorization/authorization.service.ts` đọc principal hiện tại; `role-policy.ts`; CLI bootstrap admin | `effectiveRoles()` cấp `VERIFIED_MEMBER` chỉ dựa trên OTP; `APPROVED_DRIVER` mới là enum, chưa có nghiệp vụ cấp/thu hồi                         |
| OTP            | `phone-verification.service.ts` xác minh và thêm `VERIFIED_MEMBER` vào `users.roles`                   | Phải cập nhật đồng bộ nếu định nghĩa VERIFIED_MEMBER yêu cầu danh tính; không chỉ sửa UI                                                        |
| Profile        | `users/profile.policy.ts` trả whitelist và áp privacy                                                  | Chỉ có `phoneVerified`; chưa có trạng thái danh tính, phương tiện/cộng đồng                                                                     |
| File           | `files.service.ts`, `packages/storage`: presign, decode, owner check, private bucket                   | Chỉ AVATAR/VERIFICATION_SANDBOX; chưa liên kết file với hồ sơ, chưa có quyền đọc evidence của reviewer; owner đang được yêu cầu xóa file bất kỳ |
| Worker         | Outbox dispatcher, retry BullMQ, retention                                                             | `main.ts` nối toàn bộ queue vào `createSampleHandler`; chưa dispatch theo event type, chưa xử lý callback/expiry eKYC                           |
| Retention      | `worker/retention.ts` xóa dữ liệu auth/consent và file                                                 | Chưa biết verification, vehicle, membership, webhook inbox; audit mới có actorId cần quy tắc xóa/ẩn danh thêm                                   |
| Database       | Migration 001–004, transaction manager, indexes                                                        | Chưa có collection/index cho Stage 5; seed chỉ tạo marker foundation                                                                            |
| Frontend       | Dashboard, profile/privacy, people, session và BFF có chữ ký/CSRF                                      | Chưa có route xác minh, xe, cộng đồng, admin; badge dashboard “Đã xác minh” đang chỉ là OTP                                                     |
| Contracts/test | OpenAPI generated client; unit và integration Stage 4; browser profile test                            | Chưa có contract/state machine Stage 5; runbook Stage 4 còn ghi runtime acceptance chờ Docker                                                   |

Không coi file `VERIFICATION_SANDBOX` hiện có là hồ sơ eKYC, không coi OTP thành xác minh danh tính. Không mở quyền ADMIN vào endpoint download file hiện tại theo kiểu đọc mọi file.

## 3. Quyết định nghiệp vụ đề xuất trước khi code

Các lựa chọn dưới đây là đề xuất cho Stage 5, không phải hành vi hiện có của Stage 4.

1. Giữ `phoneStatus` riêng. Thêm `identityStatus`: NOT_SUBMITTED, PENDING, VERIFIED, REJECTED; lưu `identityMode: SANDBOX` để mọi badge ghi “Xác minh thử nghiệm”. EXPIRED/CANCELLED thuộc attempt; khi attempt hết hạn mà chưa từng duyệt, projection về NOT_SUBMITTED cùng lý do của attempt gần nhất.
2. `VERIFIED_MEMBER` hiệu lực = tài khoản ACTIVE + OTP VERIFIED + danh tính VERIFIED. `APPROVED_DRIVER` = VERIFIED_MEMBER + ít nhất một phương tiện APPROVED còn hiệu lực. Admin/moderator vẫn dựa trên role quản trị + OTP, không bắt buộc eKYC để tránh vòng lặp bootstrap.
3. Kết quả sandbox PASSED chỉ đưa hồ sơ vào hàng đợi REVIEW_PENDING; không tự cấp quyền. Admin quyết định cuối, có lý do/audit cho cả approve/reject/revoke. Không cho tự duyệt hồ sơ, xe hoặc membership của chính mình; seed/demo cần hai admin.
4. ADMIN được duyệt các nhóm trên. MODERATOR chưa mặc định được đọc giấy tờ hay duyệt danh tính; phân quyền moderator chi tiết để sau. Quyền đọc evidence gắn với hồ sơ cụ thể và file đã liên kết.
5. Cộng đồng do admin tạo và quản lý; MEMBER đã OTP có thể xin gia nhập, không cần đợi eKYC. Membership độc lập với quyền chủ xe. Không công khai danh sách thành viên; profile không tự công khai cộng đồng mới tham gia.
6. Cho phép nhập thông tin xe ở DRAFT; chỉ gửi duyệt khi đủ VERIFIED_MEMBER. Sửa thông tin ảnh hưởng duyệt của xe đã APPROVED phải thu hồi duyệt và gửi lại. Xe máy tối đa một chỗ khách; ô tô lưu số chỗ khách, không gồm tài xế, admin xác nhận theo dữ liệu tổng hợp.

Khi triển khai mục 2 phải cập nhật PLAN/ADR về ý nghĩa xác minh, OTP tests, auth/session DTO, bootstrap/last-admin invariant và migration. Không backfill người đã OTP thành identity VERIFIED, không tin role driver cũ khi không có xe được duyệt.

## 4. Backend — công việc và tiêu chí hoàn thành

### BE-00 — Chốt nền local và contract

- Chạy lại Stage 4 integration/E2E với Docker, lưu kết quả; nếu chưa có Docker chỉ tiếp tục thiết kế/unit, chưa đóng runtime acceptance.
- Thêm module `verification`, `vehicles`, `communities`, `admin` theo modular monolith. Dùng `strictDto`, signed BFF, session hiện tại, CSRF và rate limit như Stage 4.
- Định nghĩa enums, DTO riêng cho owner/reviewer/profile; mọi list có cursor, limit tối đa 50, filter whitelist; chuẩn lỗi 403/404/409/429 và `requestId`.
- API contract phải chạy OpenAPI offline và generate client được trước khi frontend gọi thật.

Hoàn thành khi: migration chạy lặp an toàn; contract không lộ evidence URL, object key hay dữ liệu reviewer trong response member thông thường.

### BE-01 — Mô hình dữ liệu, quyền và chuyển trạng thái

| Collection                  | Dữ liệu chính                                                                                            | Ràng buộc/index                                                                             |
| --------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `verification_applications` | userId, attempt, status, mode, providerRef, evidenceFileIds, version, expiresAt, decision                | Unique userId+attempt; partial unique userId khi active=true; queue status+createdAt        |
| `webhook_events`            | provider, eventId, applicationId, payloadHash, result chuẩn hóa, receivedAt, processingStatus            | Unique provider+eventId; pending+receivedAt; retention có hạn, không lưu ảnh/raw PII        |
| `vehicles`                  | ownerId, type, model, color, syntheticPlate, passengerCapacity, evidenceFileIds, status, version, review | ownerId+status; status+submittedAt; plate chuẩn hóa unique cho xe chưa archived trong local |
| `communities`               | slug, name, type SCHOOL/COMPANY, description, status ACTIVE/ARCHIVED, version                            | Unique slug; status+name                                                                    |
| `community_memberships`     | communityId, userId, status, version, requestReason, decision                                            | Unique communityId+userId; communityId+status; userId+status                                |

- Application: DRAFT → PROVIDER_PENDING → REVIEW_PENDING → APPROVED/REJECTED. PROVIDER_PENDING có thể → REJECTED/EXPIRED; owner có thể CANCEL trước quyết định. APPROVED có thể REVOKED bởi admin. Resubmit tạo attempt mới; callback attempt cũ không đổi current identity.
- Vehicle: DRAFT → PENDING → APPROVED/REJECTED; owner withdraw về DRAFT; sửa xe APPROVED về DRAFT; admin revoke → REVOKED; owner archive → ARCHIVED. Resubmit REJECTED/REVOKED qua DRAFT.
- Membership: PENDING → APPROVED/REJECTED; PENDING → CANCELLED; APPROVED → LEFT/REVOKED. Xin lại sau reject/leave/revoke theo cooldown local 7 ngày; retry cùng request trả bản ghi hiện có.
- Mọi quyết định dùng `expectedVersion`/compare-and-set. Hai admin duyệt cùng lúc: một quyết định thành công, bên còn lại 409; audit đúng một lần.
- Transaction gồm cập nhật state, projection quyền, audit và outbox. Kiểm tra actor còn ADMIN, target còn ACTIVE và dependency còn hợp lệ ngay trong transaction; serialize các cập nhật quyền liên quan để không lọt race revoke/delete.
- Quyền kinh doanh lấy từ trạng thái hiện hành, role cached chỉ là projection. Thay phone làm mất quyền hiệu lực ngay; verify lại phone chỉ khôi phục khi identity/xe vẫn hợp lệ. Giữ invariant admin cuối cùng.

Hoàn thành khi: unit state machine và integration race test chứng minh không tự cấp quyền qua request/role cũ, không duyệt tài khoản đã yêu cầu xóa.

### BE-02 — Evidence, quyền reviewer và retention

- Mở rộng purpose có kiểu rõ: IDENTITY_SANDBOX và VEHICLE_DOCUMENT_SANDBOX; xử lý tương thích file VERIFICATION_SANDBOX cũ bằng mapping/migration rõ ràng. Giữ ảnh tổng hợp, 5 MiB, JPEG/PNG/WebP, decode/re-encode như Stage 4.
- Submit chỉ nhận file ID READY, đúng owner, đúng purpose, chưa hết hạn, chưa gắn hồ sơ khác. Việc attach phải transaction với file để chống delete/submit đồng thời.
- File gắn hồ sơ đang xét không xóa trực tiếp qua FilesService.remove: trả 409 và cho owner hủy hồ sơ trước. Admin đọc qua endpoint evidence của hồ sơ/xe, kiểm tra liên kết rồi ký GET 60 giây, audit actor+subject+resource. Không gửi ảnh/URL ký vào outbox, log hay bảng list.
- Chốt retention local: file không gắn giữ chính sách Stage 4; evidence gắn hồ sơ tối đa 30 ngày từ submit, không kéo dài vô hạn. Nếu hết hạn lúc pending thì expire application; xóa bytes không tự xóa quyết định đã duyệt. Xe cần evidence mới khi gửi lại.
- Mở rộng account deletion cho mọi collection mới, pending jobs/callback và trường actorId trong audit. Callback/job không được hồi sinh account đã khóa/xóa. Retention không xóa metadata trước khi xóa object thành công.

Hoàn thành khi: owner khác, MEMBER và MODERATOR đều không đọc được evidence; ADMIN không đọc file rời không thuộc hồ sơ; expired/revoked URL issuance bị chặn, anonymous object GET vẫn 403.

### BE-03 — Adapter eKYC sandbox và webhook

- Interface `EkycProvider`: createSession(applicationId, attempt, idempotencyKey), normalizeResult, verifyWebhook. Triển khai mock local do dự án kiểm soát; không giả định contract của FPT.AI.
- Config `EKYC_PROVIDER=disabled|mock`; mock chỉ local/test. Chọn scenario tổng hợp PASS, FAIL, PENDING, EXPIRED, TIMEOUT trong sandbox runner có xác thực; không nhận trực tiếp `verified=true` từ browser.
- Mock provider gửi HTTP callback có chữ ký thật tới API. Webhook riêng không dùng session/CSRF/BFF signature; dùng raw body + HMAC với key riêng, keyId, timestamp, eventId, so sánh constant-time, cửa sổ 5 phút, giới hạn body/rate.
- Durable inbox: verify chữ ký trước, ghi event unique và outbox cùng transaction, ACK sau khi persist. Event trùng cùng hash ACK an toàn; cùng eventId khác hash từ chối và audit. Retry transport ký timestamp mới nhưng giữ eventId/payload.
- Worker router theo event type; không đưa eKYC event vào sample handler. Dedupe effect trong Mongo, retry có backoff, phân biệt lỗi vĩnh viễn và tạm thời, trạng thái thất bại có thể retry qua admin local.
- Callback bind providerRef+applicationId+attempt; callback sai user, stale, out-of-order, sau expiry/cancel/deletion chỉ ghi kết quả bỏ qua phù hợp, không đảo state terminal. Sweep expire các phiên không nhận callback.

Hoàn thành khi: kiểm thử invalid signature, body tamper, timestamp cũ, duplicate, restart sau persist-before-ACK, worker retry và callback muộn; không quyết định quyền chỉ bằng callback.

### BE-04 — Phương tiện và quyền chủ xe

- CRUD owner, submit/withdraw/archive; validate loại xe, trường bắt buộc, capacity, evidence và version. Không trả biển số/evidence trong profile công khai thành viên.
- Admin approve/reject/revoke có lý do; chỉ approve khi owner đủ xác minh và evidence READY chưa hết hạn. Sửa/revoke/archive xe cuối cùng thu hồi APPROVED_DRIVER ngay; nếu còn xe APPROVED khác thì giữ quyền.
- Tạo policy `canPublishNeed` và `canCreateTripWithVehicle(user, vehicleId)` dùng cho các stage sau; admin không bypass ownership hay approval xe. Chưa tạo nhu cầu/chuyến ở Stage 5.

Hoàn thành khi: test nhiều xe, xe của người khác, sửa capacity sau duyệt, identity revoked, phone changed và session cũ không giữ quyền sai.

### BE-05 — Cộng đồng và membership

- Admin tạo/sửa/archive cộng đồng; member browse danh mục ACTIVE, xin tham gia, hủy, rời; admin duyệt/từ chối/thu hồi có lý do.
- Policy `isActiveCommunityMember(userId, communityId)` kiểm tra user ACTIVE, community ACTIVE và membership APPROVED mỗi lần; PENDING không cấp quyền. Archive community thu hồi quyền ngay qua policy, không cần cập nhật đồng loạt để bảo đảm đúng.
- Không trả roster, email, phone, requestReason cho người ngoài/admin không có quyền. Profile chỉ thêm community summary theo lựa chọn chia sẻ rõ ràng; mặc định chỉ owner thấy membership.

Hoàn thành khi: unique membership chống gửi trùng, đồng thời approve/leave/revoke cho kết quả nhất quán; community archived không thể xin mới hoặc cấp quyền.

### BE-06 — Admin, seed và quan sát local

- Admin queues tách verification/vehicle/membership, filter trạng thái, detail, decision và audit history theo resource. Audit chỉ metadata cần thiết; lý do reject an toàn hiển thị cho owner, không lẫn ghi chú nội bộ.
- Seed idempotent chỉ local/test: hai admin synthetic đã OTP, member chưa xác minh và bộ dữ liệu xe/cộng đồng giả. Giữ CLI bootstrap một lần làm ngoại lệ thiết lập hệ thống; mọi xét duyệt nghiệp vụ sau đó phải qua UI.
- Cung cấp sandbox runner/retry route local có ADMIN và CSRF, tài liệu demo hai browser context. Không thêm endpoint mở để tự gán role hoặc sửa trạng thái tùy ý.

## 5. API dự kiến để frontend triển khai

Đường dẫn dưới đây tương đối với `/api/v1`; BFF Next dùng `/api/...`. Những nhóm endpoint phải có DTO riêng, không dùng proxy URL tùy ý.

| Nhóm                | Endpoint chính                                                                                                                     | Quyền                                               |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Identity owner      | GET `/me/verification`; POST `/verification/applications`; GET `/verification/applications/:id`; POST `/:id/submit`, `/:id/cancel` | Owner + session; submit cần OTP + consent hiện hành |
| Callback            | POST `/webhooks/ekyc/mock`                                                                                                         | Chữ ký provider, chỉ local/test                     |
| Vehicles owner      | GET/POST `/me/vehicles`; GET/PUT `/me/vehicles/:id`; POST `/:id/submit`, `/:id/withdraw`, `/:id/archive`                           | Owner; submit cần VERIFIED_MEMBER                   |
| Communities         | GET `/communities`, `/communities/:id`; GET `/me/memberships`; POST `/communities/:id/join`, `/:id/cancel-request`, `/:id/leave`   | Thành viên; join cần OTP                            |
| Admin review        | GET `/admin/verifications`, `/admin/vehicles`, `/admin/memberships`; GET từng `/:id`; POST từng `/:id/decision`                    | ADMIN hiện hành; expectedVersion, action, reason    |
| Evidence            | POST `/admin/verifications/:id/evidence/:fileId/access`, tương tự vehicles                                                         | ADMIN, lý do truy cập, CSRF; audit trước ký         |
| Community admin     | POST `/admin/communities`; PUT `/admin/communities/:id`; POST `/:id/archive`                                                       | ADMIN                                               |
| Audit/local tooling | GET `/admin/audit?resourceType=&resourceId=`; POST `/admin/sandbox/verification/:id/run`, `/:id/retry`                             | ADMIN; sandbox routes chỉ local/test                |

POST submit/create hỗ trợ Idempotency-Key scope actor+operation, bind body hash: cùng key khác body trả 409. Decision dựa version; retry quyết định đã ghi trả kết quả cũ khi cùng command ID, không nhân đôi audit.

## 6. Frontend — công việc riêng

### FE-00 — Khung navigation và trạng thái quyền

- Dashboard tách ba trạng thái: điện thoại, danh tính thử nghiệm, quyền chủ xe; bỏ badge “Đã xác minh” mơ hồ. Thêm link Xác minh, Phương tiện, Cộng đồng; ADMIN có link quản trị.
- Tạo admin layout/navigation + route guard UX; API vẫn là nơi quyết định quyền. Handle 401 refresh, 403, 404, 409 version conflict và 429 với thông báo Việt.
- Dùng generated API client qua BFF, CSRF như hiện tại; query keys tách owner/admin. Khi quyết định hoặc đổi phone/logout, refresh session và invalidate dữ liệu liên quan; polling 5–10 giây chỉ khi pending và tab đang hiển thị, dừng khi terminal. Không cần socket Stage 5.

### FE-01 — `/settings/verification`

- Stepper: điều kiện OTP/consent → chọn dữ liệu tổng hợp/evidence → gửi → chờ sandbox → chờ admin → kết quả.
- Nhãn “Xác minh thử nghiệm” xuyên suốt; render distinct pending, rejected+reason, expired+retry, approved và revoked. Không hiển thị nút tự duyệt hoặc coi mock PASS là thành công cuối.
- Upload tái sử dụng logic Stage 4 thành component dùng chung: kiểm tra sơ bộ, progress/busy, retry upload mới khi URL hết hạn; lỗi server là kết quả cuối. Không lưu URL evidence vào localStorage.
- Không ép toàn bộ người dùng hoàn tất eKYC để mở hồ sơ/cộng đồng; chỉ khóa hành động cần quyền tương ứng.

### FE-02 — `/settings/vehicles` và `/settings/vehicles/[id]`

- List trạng thái + form loại xe/model/màu/biển số giả/capacity/evidence; review summary trước submit.
- State rõ DRAFT/PENDING/APPROVED/REJECTED/REVOKED/ARCHIVED; reason và CTA chỉnh sửa/gửi lại/rút/xóa lưu trữ. Cảnh báo trước sửa xe đã duyệt vì cần xét duyệt lại.
- Profile người khác chỉ hiển thị summary xe được duyệt theo quyền profile: loại/model/màu/số chỗ khách; không hiện biển số, file hay ghi chú duyệt.

### FE-03 — `/communities`, `/communities/[id]`, `/settings/communities`

- Danh mục, tìm theo tên, detail; nút xin gia nhập/hủy/rời theo state, lý do và cooldown.
- Membership của tôi: chờ duyệt/đã tham gia/từ chối/thu hồi; trường hợp community archived có trạng thái riêng trên UI.
- Không làm feed cộng đồng hay danh sách người trong cộng đồng ở stage này.

### FE-04 — `/admin` và màn hình xét duyệt

- `/admin/verifications`, `/admin/vehicles`, `/admin/memberships`: bảng có filter, cursor và empty/loading/error states; detail riêng cho từng loại.
- Reviewer mở evidence bằng thao tác có chủ đích, liên kết ngắn hạn, tải lại khi hết hạn; không preload toàn bộ ảnh trong list.
- Approve/reject/revoke bắt buộc reason và confirmation; disable khi thiếu điều kiện hoặc tự duyệt. 409 thì reload detail và thông báo đã có thay đổi, không tự gửi lại quyết định.
- `/admin/communities`: tạo/sửa/archive; `/admin/audit`: xem lịch sử resource vừa xử lý. Sandbox scenario/retry đặt trong khu vực công cụ thử nghiệm có nhãn rõ.
- Form có label, keyboard focus, inline error, trạng thái screen reader; responsive bảng admin trên màn nhỏ. Không hiển thị enum/stack trace thay cho nội dung người dùng.

## 7. Thứ tự triển khai đề xuất

| Đợt | Backend                                                    | Frontend                                     | Điều kiện đóng đợt                                     |
| --- | ---------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------ |
| 5.0 | BE-00, chốt role semantics, migration/contracts            | FE-00, state mock theo contract              | Stage 4 runtime baseline rõ; contract/state thống nhất |
| 5.1 | BE-01 identity, BE-02, BE-03, admin verification tối thiểu | FE-01 + phần review identity của FE-04       | Một luồng eKYC synthetic → admin → quyền chạy E2E      |
| 5.2 | BE-04, policy driver, retention xe                         | FE-02 + admin vehicles                       | Xe duyệt/thu hồi làm thay đổi quyền ngay               |
| 5.3 | BE-05, admin communities/membership                        | FE-03 + admin membership/community           | Join/reject/resubmit/leave/revoke qua UI               |
| 5.4 | BE-06, race/retry/deletion tests, runbook                  | Hoàn thiện FE-04, accessibility/error states | Toàn bộ acceptance local đạt, không sửa DB để demo     |

Nên bắt đầu bằng một lát cắt eKYC + UI admin chạy trọn luồng, sau đó mới thêm xe và cộng đồng. Không xây đồng loạt ba bộ form khi chưa có quyết định quyền và contract.

## 8. Test và definition of done local

| Lớp              | Trường hợp bắt buộc                                                                                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit backend     | State transitions, capability matrix, normalization, DTO chống mass assignment, evidence projection, webhook signature/hash/timestamp, expiry                         |
| Integration thật | Mongo transactions/indexes; duplicate submit/callback; hai admin; callback cũ; delete/revoke đồng thời; Redis/BullMQ retry; private MinIO denial; worker restart      |
| Regression       | OTP không tự cấp identity role; admin bootstrap/last admin; profile Google login không ghi đè; Stage 4 upload/privacy/deletion; session cũ thấy quyền mới             |
| BFF/frontend     | CSRF/origin/session, route fixed, hidden evidence, query invalidation, 409/429, admin guard không là lớp bảo vệ duy nhất                                              |
| Browser E2E      | Hai context member/admin: submit → mock pass → approve; reject/resubmit; expiry; vehicle approval/revoke; membership approve/revoke; non-admin truy cập admin bị chặn |
| Retention        | Evidence expiry, cleanup retry, account deletion xóa dữ liệu Stage 5, callback sau deletion không khôi phục dữ liệu/quyền                                             |

Chạy `corepack pnpm run ci`, `corepack pnpm test:integration`, `corepack pnpm test:e2e:auth` (mở rộng suite hoặc thêm script Stage 5 rõ tên), dependency audit và secret scan. Ghi kết quả thực chạy; test skip hoặc Docker thiếu không tính PASS.

DoD: clone mới + install + dev chạy được; seed idempotent; member/admin hoàn thành mọi luồng qua UI, chỉ bootstrap hệ thống dùng CLI; không cần tài khoản nhà cung cấp bên ngoài; dữ liệu tổng hợp; không có deploy production. Unit/build xanh là cần thiết nhưng chưa đủ đóng Stage 5 nếu integration/E2E chưa chạy.
