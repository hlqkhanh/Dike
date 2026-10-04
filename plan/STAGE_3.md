# Giai đoạn 3 — OTP và phân quyền tài khoản

## 1. Mục tiêu và quyết định kiến trúc

Stage 3 mở rộng nền tảng authentication hiện tại bằng hai module độc lập:

```text
AuthModule
├── PhoneVerificationModule
│   ├── OtpProvider
│   ├── Redis challenge/rate limit
│   └── Mongo transaction xác minh số điện thoại
└── AuthorizationModule
    ├── role policy
    ├── guard/decorator
    └── CLI quản trị quyền
```

Các quyết định đã khóa:

- Chỉ triển khai `FakeOtpProvider` cho local/test trong Stage 3.
- `OTP_PROVIDER=fake` bị từ chối ở staging/production.
- Hosted environment dùng `OTP_PROVIDER=disabled`; nếu `REQUIRE_PHONE_OTP=true`, readiness phải trả `503`.
- Chưa được coi là pilot-ready cho đến khi tích hợp provider thật.
- Người dùng có nhiều role đồng thời.
- `MEMBER` và `VERIFIED_MEMBER` do hệ thống quản lý.
- `MODERATOR` và `ADMIN` được cấp/thu hồi bằng CLI có audit.
- `APPROVED_DRIVER` chỉ được tạo cơ chế phân quyền; quy trình cấp thuộc Stage 5.
- Khi đổi số, `VERIFIED_MEMBER` bị gỡ. Các quyền cao hơn được giữ nhưng tạm mất hiệu lực cho đến khi số mới được xác minh.
- Admin cuối cùng không được đổi số hoặc tự thu hồi quyền nếu việc đó làm hệ thống không còn admin hiệu lực.
- Session token/cookie không chứa role; API luôn đọc trạng thái user mới nhất từ MongoDB.
- Không fingerprint thiết bị. Rate limit “theo thiết bị” sử dụng `sessionId` đã xác thực.

### 1.1. Phạm vi chưa hoàn thành

Việc chọn và tích hợp provider thật được tạo thành cổng `S3-PILOT-01`. Master plan không được đánh dấu Stage 3 hoàn thành cho production cho đến khi cổng này đạt.

eSMS yêu cầu đăng ký trước Brandname/template đối với tuyến OTP tự sinh; giá OTP/CSKH phải lấy báo giá riêng. Tham khảo [tài liệu eSMS OTP](https://developers.esms.vn/esms-api/ham-gui-tin/tin-gencode-tu-dong-sms).

## 2. Public interface và contract

### 2.1. BFF endpoints

```text
GET  /api/auth/phone/verification
POST /api/auth/phone/verification/start
POST /api/auth/phone/verification/verify
```

Mọi mutation phải có:

- Access session hợp lệ.
- `Origin` khớp chính xác `WEB_BASE_URL`.
- CSRF token hợp lệ.
- BFF signature và request ID.
- `Cache-Control: no-store, private`.

### 2.2. NestJS endpoints

```text
GET  /api/v1/auth/phone/verification
POST /api/v1/auth/phone/verification/start
POST /api/v1/auth/phone/verification/verify
```

`start` dùng cho cả lần gửi đầu tiên và gửi lại. Nếu cooldown chưa hết, trả `429` cùng `Retry-After`; không gửi thêm OTP.

`verify` nhận:

```ts
interface VerifyPhoneOtpRequest {
  challengeId: string; // UUID
  code: string; // đúng 6 chữ số
}
```

Challenge response:

```ts
interface PhoneOtpChallengeView {
  challengeId: string;
  destinationMasked: string;
  expiresAt: string;
  resendAvailableAt: string;
  attemptsRemaining: number;
  developmentCode?: string;
}
```

Quy tắc `developmentCode`:

- Chỉ có khi `APP_ENV=local|test`, `OTP_PROVIDER=fake` và `OTP_DEV_EXPOSE_CODE=true`.
- Không được lưu, log hoặc đưa vào test artifact.
- Luôn bị loại khỏi response trong staging/production.
- Production config phải từ chối `OTP_DEV_EXPOSE_CODE=true`.

### 2.3. Role contract

```ts
type AccountRole = 'MEMBER' | 'VERIFIED_MEMBER' | 'APPROVED_DRIVER' | 'MODERATOR' | 'ADMIN';
```

`AuthenticatedSessionView.user` bổ sung:

```ts
roles: AccountRole[];
```

Đây là danh sách role đang có hiệu lực, không phải toàn bộ grant lưu trong database:

- `MEMBER`: hiệu lực với mọi account `ACTIVE`.
- `VERIFIED_MEMBER`: chỉ hiệu lực khi `phoneStatus=VERIFIED`.
- `APPROVED_DRIVER`: chỉ hiệu lực khi số điện thoại đã xác minh.
- `MODERATOR` và `ADMIN`: chỉ hiệu lực khi số điện thoại đã xác minh.
- `ADMIN` được phép vượt qua policy yêu cầu `MODERATOR`, nhưng không tự động sửa mảng role trong database.

### 2.4. Error code

Bổ sung các code ổn định:

```text
OTP_NOT_CONFIGURED
OTP_PROVIDER_UNAVAILABLE
OTP_CHALLENGE_NOT_FOUND
OTP_CHALLENGE_EXPIRED
OTP_CODE_INVALID
OTP_ATTEMPTS_EXHAUSTED
OTP_RESEND_TOO_SOON
OTP_ALREADY_VERIFIED
PHONE_CHANGED
PHONE_ALREADY_IN_USE
ROLE_REQUIRED
ROLE_OPERATION_FORBIDDEN
ROLE_LAST_ADMIN
```

Mapping:

- OTP/code/request không hợp lệ: `400`.
- Session hoặc phone đã thay đổi: `409`.
- Số đã thuộc tài khoản khác: `409`.
- Thiếu quyền: `403`.
- Challenge hết hạn: `410`.
- Rate limit/cooldown: `429`.
- Provider chưa cấu hình hoặc lỗi: `503`.

Không trả provider response, số điện thoại đầy đủ, bucket rate-limit bị chặn hoặc stack trace.

## 3. Data model và security policy

### 3.1. User

Bổ sung:

```text
roles: AccountRole[]
roleVersion: number
phoneVersion: number
phoneVerifiedAt?: Date
```

Quy tắc:

- User mới luôn có `roles=[MEMBER]`.
- Migration backfill `MEMBER` cho user hiện có.
- User đã `VERIFIED` được backfill thêm `VERIFIED_MEMBER`.
- Nhập lại đúng số đã verified là no-op, không làm mất verification.
- Đổi sang số khác thực hiện trong transaction:
  - Tăng `phoneVersion`.
  - Lưu số mới đã mã hóa và lookup HMAC.
  - Đặt `phoneStatus=UNVERIFIED`.
  - Xóa `phoneVerifiedAt`.
  - Gỡ `VERIFIED_MEMBER`.
  - Ghi audit.
- Challenge cũ chứa `phoneVersion`; vì vậy không thể xác minh số cũ sau khi đổi số.
- Không tự merge account bằng số điện thoại.

### 3.2. Unique verified phone

Migration thay index Stage 2 bằng partial unique index:

```text
{ phoneLookupHash: 1 }
unique: true
partialFilterExpression:
  phoneStatus = VERIFIED
  phoneLookupHash là string
```

Migration phải:

- Kiểm tra duplicate verified phone trước khi tạo index.
- Fail với thông báo vận hành đã sanitize nếu có conflict.
- Không sửa hoặc merge dữ liệu tự động.
- Có checksum và idempotency như migration runner hiện tại.

Khi hai account cùng xác minh một số đồng thời, MongoDB unique index là lớp bảo vệ cuối. Duplicate key phải được map sang `PHONE_ALREADY_IN_USE`.

### 3.3. OTP challenge

Challenge lưu trong Redis với TTL, gồm:

```text
challengeId
userId
sessionIdHash
phoneLookupHash
phoneVersion
purpose=PHONE_VERIFICATION
provider
providerReference
status=PENDING|PROVIDER_APPROVED|CONSUMED|EXHAUSTED
attemptsRemaining
issuedAt
expiresAt
resendAvailableAt
providerApprovedAt
```

Không lưu:

- OTP dạng rõ.
- Số điện thoại dạng rõ.
- Raw IP hoặc raw user-agent.
- Provider credential.
- Nội dung SMS.

OTP fake:

- Sinh 6 chữ số bằng CSPRNG.
- Chỉ lưu HMAC-SHA-256 bằng keyring riêng `OTP_CODE_KEYRING`.
- Raw code chỉ tồn tại tạm thời trong memory và optional local response.
- So sánh HMAC constant-time.
- Mỗi code chỉ được dùng một lần.

### 3.4. OTP lifecycle

Giá trị mặc định:

- Hạn OTP: 5 phút.
- Cooldown gửi lại: 60 giây.
- Tối đa 5 lần nhập sai/challenge.
- Mỗi user chỉ có một challenge đang hoạt động cho phiên bản phone hiện tại.
- Gửi lại thành công làm challenge cũ mất hiệu lực.
- Nếu provider gửi thất bại, challenge cũ vẫn còn hiệu lực.

Luồng verify an toàn khi crash:

1. Khóa ngắn challenge để ngăn hai verify đồng thời.
2. Kiểm tra challenge, session, `phoneLookupHash` và `phoneVersion`.
3. Provider kiểm tra code.
4. Khi provider chấp nhận, ghi `PROVIDER_APPROVED` vào Redis.
5. Mongo transaction:
   - Kiểm tra lại user và phone version.
   - Đặt phone `VERIFIED`.
   - Thêm `VERIFIED_MEMBER`.
   - Ghi `phoneVerifiedAt`.
   - Ghi audit với `challengeId`.
6. Đặt challenge `CONSUMED`.

Mongo operation phải idempotent theo `challengeId`, để crash giữa bước 5–6 không tạo tác dụng lặp.

### 3.5. Rate limit

Send OTP:

| Dimension         | Giới hạn |
| ----------------- | -------: |
| User              |    5/giờ |
| User              |  10/ngày |
| Phone lookup hash |    5/giờ |
| Phone lookup hash |  10/ngày |
| Device/session    |    5/giờ |
| Device/session    |  10/ngày |
| IP hash           |   10/giờ |
| IP hash           |  30/ngày |
| Cooldown          |  60 giây |

Verify OTP:

| Dimension         |   Giới hạn |
| ----------------- | ---------: |
| Challenge         |  5 lần sai |
| User              | 10/15 phút |
| Phone lookup hash | 10/15 phút |
| Device/session    | 10/15 phút |
| IP hash           | 30/15 phút |

Các bucket phải được kiểm tra và tăng atomically bằng Redis Lua; không được tăng một phần rồi fail ở bucket sau. `Retry-After` là thời gian chờ lớn nhất trong các bucket bị chặn.

Redis outage làm send/verify fail-closed. Không fallback sang memory limiter.

### 3.6. Authorization

Tạo `AuthorizationService`, `RequireRoles` metadata và guard dùng chung.

Quy tắc:

- Không tin role do browser/BFF gửi.
- Guard lấy principal từ opaque access session rồi đọc user hiện tại.
- Kiểm tra account `ACTIVE`, phone verification và effective roles.
- Có chế độ `anyOf` và `allOf`.
- `ADMIN` override policy moderator nhưng không override trạng thái account/phone.
- Không tạo endpoint demo chỉ để thử guard; kiểm tra bằng test module nội bộ.
- Stage 4/5 phải dùng guard/service này, không tự so sánh string role trong controller.

### 3.7. Role operations CLI

Các lệnh:

```bash
corepack pnpm auth:role:list -- --user-id <id>
corepack pnpm auth:role:bootstrap-admin -- --user-id <id> --reason <ticket> --confirm
corepack pnpm auth:role:grant -- --actor-id <id> --user-id <id> --role MODERATOR|ADMIN --reason <ticket>
corepack pnpm auth:role:revoke -- --actor-id <id> --user-id <id> --role MODERATOR|ADMIN --reason <ticket>
```

Chính sách:

- `MEMBER` và `VERIFIED_MEMBER` không được sửa bằng CLI.
- `APPROVED_DRIVER` không được cấp trong Stage 3.
- Target của `MODERATOR|ADMIN` phải có phone verified.
- Bootstrap chỉ chạy khi chưa có bất kỳ admin hiệu lực nào.
- Các lần cấp tiếp theo yêu cầu actor có `ADMIN` hiệu lực.
- Không được thu hồi admin hiệu lực cuối cùng.
- Mọi thay đổi role và audit chạy cùng Mongo transaction.
- Dùng singleton authorization revision document để serialize các thao tác admin cạnh tranh.
- Production yêu cầu flag xác nhận rõ và reason/ticket không rỗng.
- Không seed sẵn admin hoặc tài khoản đặc quyền.

## 4. Phân công ba thành viên

### S3-00 — Contract freeze

Cả nhóm thống nhất trước khi code:

- Endpoint, DTO, error code và role enum.
- OTP TTL, cooldown, attempt và rate-limit.
- Migration/index strategy.
- Ownership file và quy tắc lockfile.
- Hai exit gate: code-complete và pilot-ready.

### Member A — OTP backend và phone verification

- **S3-A01:** Tạo `PhoneVerificationModule`, `OtpProvider`, provider result/error contract.
- **S3-A02:** Tạo `FakeOtpProvider` và `DisabledOtpProvider`; thêm keyring/config guard.
- **S3-A03:** Xây Redis challenge store, state transition, distributed lock và atomic multi-bucket limiter.
- **S3-A04:** Implement status/start/verify service; binding theo user, session, phone hash và version.
- **S3-A05:** Implement Mongo finalization transaction, idempotency record và unique-phone conflict mapping.
- **S3-A06:** Cập nhật `updatePhone` để no-op với cùng số, reset verification với số mới và chặn last-admin lockout.
- **S3-A07:** Controller, DTO, Swagger, sanitized audit/logging và provider timeout handling.
- **S3-A08:** Unit/integration/security test cho challenge, retry, concurrency, expiry, phone race và Redis outage.

### Member B — Role model và authorization

- **S3-B01:** Thêm role schema/runtime contract, `roles`, `roleVersion`, `phoneVersion`.
- **S3-B02:** Viết migration backfill và partial unique verified-phone index.
- **S3-B03:** Tạo effective-role policy, `AuthorizationService`, decorator và guard.
- **S3-B04:** Cập nhật session/me response để trả effective roles từ MongoDB.
- **S3-B05:** Tạo role CLI, admin bootstrap, grant/revoke và append-only audit.
- **S3-B06:** Test privilege escalation, stale session, inactive user, dormant elevated role và last-admin concurrency.
- **S3-B07:** Cập nhật generated OpenAPI client sau khi Member A khóa spec.

Member B sở hữu thay đổi ở shared contracts và resolve conflict OpenAPI/client.

### Member C — BFF, web, E2E và vận hành

- **S3-C01:** Thêm ba BFF route cố định; không tạo generic proxy.
- **S3-C02:** Nâng onboarding thành flow nhập phone → gửi OTP → xác minh → vào app.
- **S3-C03:** Thêm countdown resend, attempts remaining, expired/retry/provider-error state và accessible focus management.
- **S3-C04:** Hiển thị `developmentCode` với cảnh báo local/test rõ ràng; không render khi flag tắt.
- **S3-C05:** Bổ sung Playwright flow OTP và role-aware session; không upload trace/screenshot chứa code.
- **S3-C06:** Cập nhật environment generator, CI matrix `REQUIRE_PHONE_OTP=true`, readiness và negative production-config tests.
- **S3-C07:** Cập nhật threat model/runbook cho brute force, SMS pumping, SIM swap, role escalation và production provider blocker.

Member C sở hữu `.env.example`; không thêm secret hoặc fake code cố định vào Git.

## 5. Trình tự phối hợp

1. Member B merge contract và migration skeleton.
2. Member A triển khai OTP port/challenge/service dựa trên contract đã khóa.
3. Member B hoàn thiện role guard và session response.
4. Member A bàn giao OpenAPI deterministic cho Member B generate client.
5. Member C nối BFF/UI sau khi generated client ổn định.
6. Merge theo thứ tự: contracts → database/roles → OTP backend → generated client → BFF/UI → E2E/docs.
7. Chạy integration trên Mongo replica set và Redis thật, volume sạch.
8. Không dùng fixed sleep; dùng health polling và fake clock khi kiểm tra TTL/cooldown.

## 6. Test plan

Bắt buộc có các trường hợp:

- OTP đúng, sai, hết hạn, đã dùng, quá số lần thử và gửi lại quá sớm.
- Hai request send đồng thời chỉ tạo/gửi một challenge.
- Hai verify đúng đồng thời chỉ finalization một lần.
- Crash sau `PROVIDER_APPROVED` có thể resume an toàn.
- Đổi phone làm challenge cũ không dùng được.
- Cùng phone unverified có thể tồn tại trên nhiều account.
- Hai account không thể cùng chuyển một phone sang `VERIFIED`.
- Duplicate verified-phone race được index chặn.
- Không có OTP/raw phone trong Mongo, Redis dump, log, error hay audit.
- Rate limit hoạt động độc lập theo IP/user/phone/session và atomically.
- Redis down làm mutation fail-closed.
- Fake provider, development code và OTP bypass bị chặn trong hosted config.
- User mới có `MEMBER`; verify thành công có `VERIFIED_MEMBER`.
- Đổi số làm quyền driver/moderator/admin tạm mất hiệu lực.
- Xác minh lại số mới phục hồi elevated role đã được grant.
- Browser/BFF không thể tự thêm role.
- Session đang mở phản ánh role grant/revoke ngay lần request tiếp theo.
- Không cấp hoặc thu hồi role hệ thống bằng CLI.
- Không thể xóa admin cuối cùng.
- BFF kiểm tra Origin, CSRF, signed request và không cache OTP response.
- Keyboard/focus, loading, resend countdown và error announcement đạt yêu cầu accessibility.
- OpenAPI deterministic và generated client không lệch repository.

Các lệnh exit gate:

```bash
corepack pnpm run ci
corepack pnpm test:integration
corepack pnpm test:e2e:auth
corepack pnpm api:check
corepack pnpm security:audit
```

## 7. Definition of Done và pilot gate

### 7.1. Code-complete

- Fake OTP chạy E2E ở local/test với `REQUIRE_PHONE_OTP=true`.
- Không có OTP plaintext bền vững hoặc production backdoor.
- Verified phone được unique bằng database.
- Brute-force/rate-limit/concurrency tests đều pass.
- Role guard và CLI có audit, chống privilege escalation và last-admin removal.
- Web onboarding hoạt động đầy đủ và generated API client được sử dụng.
- `pnpm ci`, integration và E2E đều xanh.

### 7.2. Pilot-ready — chưa thuộc lựa chọn triển khai hiện tại

Trước pilot bắt buộc hoàn thành `S3-PILOT-01`:

- Chọn vendor thật và nhận báo giá chính thức.
- Hoàn tất hồ sơ sender/đầu số/template cần thiết.
- Viết production adapter qua cùng `OtpProvider`.
- Chạy provider contract test, timeout/error mapping và sandbox smoke test.
- Đặt `OTP_PROVIDER` thành provider thật.
- Bật `REQUIRE_PHONE_OTP=true`.
- Readiness production trả `200`.
- Thực hiện canary với số kiểm thử của Viettel, VinaPhone và MobiFone.
- Đặt cảnh báo chi phí và hạn mức gửi toàn cục.

Cho đến khi gate này đạt, staging/production không được phát hành nghiệp vụ yêu cầu verified phone.
