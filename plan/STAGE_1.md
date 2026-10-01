# Giai đoạn 1 — Nền tảng ứng dụng và local infrastructure

## 1. Mục tiêu và nguyên tắc

Giai đoạn 1 tạo nền tảng chạy thật cho web, API và worker nhưng chưa triển khai auth hoặc nghiệp vụ Dike. Kết quả phải đủ ổn định để các giai đoạn sau chỉ bổ sung domain module thay vì sửa lại bootstrap, infrastructure hoặc contract nền tảng.

Nguyên tắc bắt buộc:

- Dùng modular monolith: một NestJS API chia module rõ ràng và một worker process riêng dùng chung contract.
- MongoDB là nguồn trạng thái chính; Redis/BullMQ không phải nguồn dữ liệu cuối cùng.
- OpenAPI là hợp đồng REST chính; web và mobile tương lai dùng generated client.
- Local/test dùng MongoDB single-node replica set để có transaction thật.
- Không thêm auth giả, user giả, controller nghiệp vụ placeholder hoặc đường tắt demo.
- Không dùng secret, PII, vị trí hay giấy tờ thật trong seed, fixture và log.
- Dependency dùng bản stable tương thích Node.js 22, không dùng prerelease và phải pin phiên bản chính xác trong lockfile.
- Không thêm Turborepo; tiếp tục dùng pnpm workspace và script Node.js cross-platform.
- CI/review tiếp tục ở chế độ advisory theo ADR-0007, nhưng lỗi security-critical không được đưa vào production.

### 1.1. Cấu trúc mục tiêu

```text
apps/
  api/                  @dike/api — NestJS REST API
  web/                  @dike/web — Next.js App Router
  worker/               @dike/worker — BullMQ worker và outbox dispatcher

packages/
  api-client/           @dike/api-client — generated OpenAPI client
  config/               @dike/config — shared TypeScript/config utilities
  contracts/            @dike/contracts — event, job và error contracts
  ui/                   @dike/ui — Urban Mint token và component nền tảng

infra/
  docker/               MongoDB replica set, Redis và MinIO
  scripts/              local orchestration và safety checks
```

### 1.2. Public interface nền tảng

```text
GET /api/v1/health/live
GET /api/v1/health/ready
GET /api/openapi.json       # chỉ local/test
GET /api/docs               # chỉ local/test
```

Error response chuẩn:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "requestId": "uuid",
    "details": []
  }
}
```

Quy ước request:

- API prefix là `/api/v1`; web mặc định cổng `3000`, API cổng `3001`.
- Nhận và trả `x-request-id`; chỉ tái sử dụng UUID hợp lệ, nếu không API tự sinh UUID mới.
- Validation bật whitelist, transform và `forbidNonWhitelisted`.
- JSON body tối đa 1 MB.
- CORS dùng allowlist từ environment, không dùng wildcard.
- Swagger tắt mặc định trong production.
- Log JSON bằng Pino và che authorization, cookie, token, password, connection string.
- Client không nhận stack trace, lỗi driver/database hoặc chi tiết nội bộ.

### 1.3. Developer interface

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm dev
corepack pnpm dev:apps
corepack pnpm infra:up
corepack pnpm infra:down
corepack pnpm infra:reset -- --confirm
corepack pnpm infra:logs
corepack pnpm db:migrate
corepack pnpm db:migrate:status
corepack pnpm db:seed
corepack pnpm api:generate
corepack pnpm api:check
corepack pnpm test:integration
corepack pnpm run ci
```

`pnpm dev` kiểm tra Docker, tạo `.env.local` với credential local ngẫu nhiên nếu chưa có, start/wait infrastructure rồi chạy web, API và worker song song. Ctrl+C dừng process ứng dụng nhưng giữ container/volume. Chỉ `infra:reset -- --confirm` được xóa dữ liệu local của đúng Compose project Dike.

---

## 2. Ownership và quy tắc phối hợp

| Thành viên | Ownership chính                                              | File giao nhau                               |
| ---------- | ------------------------------------------------------------ | -------------------------------------------- |
| Member A   | `apps/api`, MongoDB transaction/migration/outbox persistence | Đề xuất biến môi trường và contract cho B/C  |
| Member B   | `apps/web`, `packages/*`, root manifest và lockfile          | Tổng hợp dependency của A/C                  |
| Member C   | `apps/worker`, `infra/*`, dev orchestration và CI            | Sở hữu `.env.example` sau khi nhận input A/B |

Quy tắc:

- Dùng các branch `stage1/api-foundation`, `stage1/web-foundation`, `stage1/infra-worker` vì ba nhánh cùng tác động workspace.
- Member B là người duy nhất resolve thay đổi root `package.json` và `pnpm-lock.yaml` trong Stage 1.
- Không sửa trực tiếp generated client; chỉ sửa OpenAPI rồi chạy generator.
- A bàn giao OpenAPI cho B và outbox persistence contract cho C.
- Thay đổi contract phải được thông báo trước khi merge để tránh web/worker dùng schema cũ.
- Mỗi task chỉ chuyển `Done` khi test và acceptance criteria riêng đã đạt.

### Dependency graph

```text
S1-B01 shared config ─┬─> S1-A01 API ─> A02 ─> A03 ─> A04 ─> A05 ─> A06
                     ├─> S1-B02 contracts ─> B03/B04 ─> B05 ─> B06
                     └─> S1-C01 infra ─> C02/C03 ─> C04 ─> C05/C06

A03 OpenAPI ────────────────────────────────> B05
A04/A05 database + outbox contract ────────> C04
A06 + B06 + C06 ───────────────────────────> Integration gate
```

---

## 3. Member A — API và MongoDB

### S1-A01 — Scaffold NestJS API

**Phụ thuộc:** S1-B01.

**Công việc:**

- Tạo `@dike/api` dùng NestJS REST với Express adapter và strict TypeScript.
- Tạo application factory dùng chung cho runtime, test và chế độ sinh OpenAPI.
- `AppModule` chỉ ghép config, observability, database, health và outbox.
- `main.ts` chỉ bootstrap, bật graceful shutdown và không chứa logic nghiệp vụ.
- Mỗi module có interface/provider rõ; không tạo controller/service nguyên khối.
- Thêm scripts `dev`, `build`, `lint`, `typecheck`, `test`, `test:integration`.

**Security:** không tạo auth demo, header giả mạo user hoặc endpoint ghi dữ liệu mẫu.

**Test:** application compile được ở runtime/test/openapi mode; shutdown đóng tài nguyên đúng thứ tự.

**Đầu ra:** API workspace và module boundary ban đầu.

**Nghiệm thu:** API build/typecheck thành công và không có module nghiệp vụ giả.

### S1-A02 — Config, request security và observability

**Phụ thuộc:** S1-A01, S1-B02.

**Công việc:**

- Validate fail-fast port, origin, MongoDB, Redis, S3 và environment bằng Zod.
- Thêm Helmet, CORS allowlist, JSON body limit 1 MB và global validation pipe.
- Tạo request context bằng `AsyncLocalStorage`.
- Validate `x-request-id`; sinh UUID mới nếu header thiếu hoặc không hợp lệ; trả ID trong response header.
- Dùng Pino structured logging, request duration và log level theo environment.
- Redact header/cookie/token/password/URI; không log nguyên payload mặc định.
- Tạo global exception filter theo error envelope chuẩn.
- Map validation, not-found và lỗi nội bộ sang code ổn định; production dùng thông báo an toàn.

**Security:** không tin request ID tùy ý; không phản chiếu input vào log/error mà chưa sanitize.

**Test:** UUID hợp lệ được giữ, UUID lỗi được thay; CORS ngoài allowlist bị từ chối; validation field thừa fail; log không chứa giá trị secret fixture.

**Nghiệm thu:** mọi response/error có request ID và không lộ stack hoặc lỗi database.

### S1-A03 — Health check và OpenAPI

**Phụ thuộc:** S1-A02, S1-C01.

**Công việc:**

- `/health/live` chỉ kiểm tra process/event loop, không phụ thuộc external service.
- `/health/ready` kiểm tra MongoDB, Redis và MinIO với timeout riêng; dependency lỗi trả `503` và trạng thái tổng quát, không trả credential/URI.
- OpenAPI có operation ID ổn định, error schemas và server `/api/v1`.
- Chỉ expose `/api/docs` và `/api/openapi.json` ở local/test.
- OpenAPI mode thay infrastructure bằng provider không kết nối mạng để generation deterministic.

**Test:** live luôn hoạt động khi dependency dừng; ready chuyển `200/503` đúng; production không expose docs.

**Nghiệm thu:** spec sinh offline được và health endpoint đúng contract.

### S1-A04 — Mongoose, transaction và migration/index runner

**Phụ thuộc:** S1-A02, S1-C01.

**Công việc:**

- Cấu hình Mongoose pool, selection/socket timeout và `autoIndex=false` ngoài local/test.
- Tạo `TransactionManager` truyền session rõ ràng và từ chối nested transaction mơ hồ.
- Tạo runner forward-only với collection `_migrations` lưu ID, checksum, thời gian và runner version.
- Dùng lock có owner/expiry để hai runner không apply đồng thời.
- Migration đã chạy nhưng checksum đổi phải fail; migration lỗi không được ghi hoàn thành.
- Migration đầu tạo index outbox và job execution.
- Có `db:migrate`, `db:migrate:status`; không tự chạy migration âm thầm lúc API start.
- Tài liệu quy tắc forward-fix và rollback thủ công cho index nguy hiểm.

**Security:** không cho input người dùng trở thành query/filter MongoDB tùy ý; log migration không chứa URI.

**Test:** commit, rollback, runner lặp, checksum mismatch và concurrent lock.

**Nghiệm thu:** transaction thật chạy trên replica set; index runner idempotent và có audit record.

### S1-A05 — Seed và outbox persistence

**Phụ thuộc:** S1-A04, S1-B02.

**Công việc:**

- Seed runner chỉ cho `APP_ENV=local|test`, có version và idempotency key.
- Seed chỉ chứa dữ liệu tổng hợp; `db:reset` từ chối staging/production.
- Tạo `OutboxEvent`: event ID, type, aggregate type/ID, payload, status, attempts, available/locked/processed timestamps, lock token và last error đã sanitize.
- Repository ghi outbox bằng cùng Mongoose session với aggregate change.
- Claim event bằng atomic conditional update; lock hết hạn có thể reclaim.
- Không tạo public endpoint để enqueue sample event; test/CLI fixture gọi application service trực tiếp.

**Test:** seed lặp không trùng; production guard; atomic aggregate + outbox rollback; concurrent claim chỉ có một winner.

**Nghiệm thu:** outbox không thể tồn tại tách rời thay đổi transaction tương ứng.

### S1-A06 — API/database verification

**Phụ thuộc:** S1-A03, S1-A05.

**Công việc và test bắt buộc:**

- Unit: config, request ID, error mapping và redaction.
- API: live/ready, validation, 404 và docs environment guard.
- Integration: transaction commit lưu đủ hai bản ghi.
- Integration: chủ động throw giữa transaction và xác nhận không bản ghi nào tồn tại.
- Integration: standalone MongoDB bị từ chối cho transaction test.
- Migration chạy lặp không đổi index; hai runner đồng thời chỉ apply một lần.
- Seed chạy lặp không trùng và fail ở production.

**Nghiệm thu:** toàn bộ test ổn định, không dùng sleep cố định và không mock transaction.

---

## 4. Member B — Web và shared packages

### S1-B01 — Shared workspace configuration

**Phụ thuộc:** Giai đoạn 0 hoàn thành.

**Công việc:**

- Tạo `@dike/config`, `@dike/contracts`, `@dike/ui`, `@dike/api-client`.
- Cung cấp TypeScript preset cho NestJS, Next.js và library; giữ ESM/NodeNext nhất quán.
- Chuẩn hóa scripts `build`, `lint`, `typecheck`, `test` cho mọi workspace.
- Root scripts dùng pnpm recursive; `dev` chạy parallel, build/test fail khi workspace fail.
- Gom dependency của A/C thành batch, pin exact version và chỉ allowlist lifecycle script đã review.
- Không thêm package trùng chức năng hoặc dependency không dùng.

**Test:** fresh frozen install không đổi lockfile; mọi package typecheck được khi chưa có application logic.

**Nghiệm thu:** workspace graph không có circular dependency và root runner bao phủ mọi package.

### S1-B02 — Shared contracts

**Phụ thuộc:** S1-B01.

**Công việc:**

- Export `ApiErrorEnvelope`, health type và request-ID constant.
- Export event `foundation.sample.requested.v1`, queue name và versioned job payload.
- Job payload có Zod schema để kiểm tra runtime.
- Không export Mongoose schema hoặc NestJS DTO sang frontend.
- Không dùng shared contract thay cho OpenAPI REST contract.

**Test:** payload hợp lệ parse được; thiếu/sai type fail; package không import NestJS/Mongoose.

**Nghiệm thu:** API, worker và web dùng cùng constant mà không tạo dependency vòng.

### S1-B03 — Urban Mint design foundation

**Phụ thuộc:** S1-B01.

Semantic token light theme:

```text
primary       #0F766E
primaryHover  #115E59
accent        #D1FAE5
background    #F7FAF9
surface       #FFFFFF
foreground    #10231D
muted         #52665E
border        #D7E3DE
danger        #B42318
focus         #0D9488
```

**Công việc:**

- System font stack, spacing theo lưới 4 px và radius 8/12/16 px.
- Tạo `Button`, `Card`, `StatusBadge` với semantic HTML.
- Có focus-visible, disabled/loading và text/icon ngoài màu sắc để biểu thị trạng thái.
- Expose token theo CSS variables để mobile có thể map lại ở Stage 16.
- Không tạo ride card, booking form hoặc màn hình nghiệp vụ.

**Test:** contrast WCAG AA, keyboard focus, accessible name, loading và disabled state.

**Nghiệm thu:** component dùng được độc lập và không phụ thuộc Next.js runtime.

### S1-B04 — Scaffold Next.js web

**Phụ thuộc:** S1-B01, S1-B03.

**Công việc:**

- Tạo `@dike/web` dùng Next.js App Router, Tailwind và TanStack Query.
- Thêm root layout, metadata, loading, error và not-found boundary.
- App shell responsive có header, main landmark và foundation status card.
- Status card có loading, success, dependency-down, offline và retry state.
- Validate public environment; không hard-code API URL.
- Không thêm login giả, mock user hoặc dữ liệu nghiệp vụ mẫu.

**Security/accessibility:** không render raw server error; keyboard và screen reader dùng được; không đưa server-only env vào client bundle.

**Nghiệm thu:** web build không cần MongoDB/Redis và hiển thị app shell ở desktop/mobile viewport.

### S1-B05 — Generated OpenAPI client

**Phụ thuộc:** S1-A03, S1-B02.

**Công việc:**

- Dùng `openapi-typescript` sinh types và `openapi-fetch` làm runtime.
- Export `createDikeClient({ baseUrl, fetch, requestId })`.
- Generated file có header `do not edit` và output deterministic.
- `api:generate` sinh spec/client; `api:check` sinh lại rồi fail nếu Git diff thay đổi.
- Web gọi health qua generated client, không dùng `fetch` thủ công.

**Test:** base URL/request ID được truyền đúng; error envelope parse đúng; client build được ở web và Node.

**Nghiệm thu:** sửa OpenAPI mà chưa regenerate làm `api:check` fail.

### S1-B06 — Web/package verification

**Phụ thuộc:** S1-B04, S1-B05.

**Công việc và test bắt buộc:**

- Unit test design token và component states.
- React Testing Library kiểm tra app shell và health loading/error/success/retry.
- Keyboard focus và accessible name cho interactive controls.
- API client tests cho request ID, base URL và error response.
- Next production build không cần local infrastructure.
- Contract drift test cho OpenAPI/generated output.

**Nghiệm thu:** web không có nghiệp vụ giả và toàn bộ quality checks đạt.

---

## 5. Member C — Docker, worker và CI

### S1-C01 — MongoDB, Redis và MinIO local

**Phụ thuộc:** S1-B01.

**Công việc:**

- Tạo Compose project cố định `dike-local` trong `infra/docker`.
- MongoDB bind `127.0.0.1:27017`, chạy `--replSet rs0`; init idempotent và chờ primary.
- Redis bind `127.0.0.1:6379`, bật password từ `.env.local` và local persistence.
- MinIO bind API `127.0.0.1:9000`, console `127.0.0.1:9001`.
- Init MinIO tạo public/private bucket; private bucket không có anonymous policy.
- Dùng named volume riêng và healthcheck cho từng service.
- Pin image tag/digest, không dùng `latest`.
- Credential generator dùng crypto random, không in giá trị và không ghi vào Git.

**Security:** chỉ expose loopback; container không mount Docker socket hoặc workspace không cần thiết.

**Test:** replica set primary, Redis yêu cầu auth, private bucket từ chối anonymous read và restart không mất dữ liệu.

**Nghiệm thu:** `docker compose up --wait` đạt healthy không dùng sleep cố định.

### S1-C02 — Cross-platform local orchestration

**Phụ thuộc:** S1-C01.

**Công việc:**

- Viết Node.js orchestrator hoạt động trên Windows/macOS/Linux.
- `pnpm dev` kiểm tra Docker daemon, port, env; start Compose; wait health; chạy app parallel.
- Forward SIGINT/SIGTERM và trả exit code khác 0 nếu app chết ngoài dự kiến.
- `dev:apps` không start Docker.
- `infra:up/down/logs` luôn scope đúng Compose project/file.
- `infra:reset -- --confirm` resolve và kiểm tra target trước khi xóa volume; không chấp nhận target rộng hoặc biến chưa resolve.

**Test:** Docker chưa chạy, port bị chiếm và service unhealthy đều báo lỗi có hướng dẫn; reset thiếu confirm bị từ chối.

**Nghiệm thu:** fresh clone start toàn bộ bằng một lệnh; Ctrl+C không xóa dữ liệu.

### S1-C03 — BullMQ worker bootstrap

**Phụ thuộc:** S1-B02, S1-C01.

**Công việc:**

- Tạo `@dike/worker` dùng shared config/contracts/logger.
- Graceful shutdown đóng worker, queue events, Redis và MongoDB.
- Queue/job name chỉ lấy từ contracts.
- Validate concurrency, attempts và backoff bằng environment với min/max an toàn.
- Sample job mặc định 5 attempts, exponential backoff; payload lỗi không retry.
- Không log nguyên payload hoặc secret.

**Test:** worker start/stop sạch; invalid payload fail vĩnh viễn; transient error được retry.

**Nghiệm thu:** worker reconnect có giới hạn và shutdown không để job nhận mới.

### S1-C04 — Outbox dispatcher và idempotent sample job

**Phụ thuộc:** S1-A05, S1-C03.

**Công việc:**

- Poll/claim outbox theo batch nhỏ với lock timeout và backpressure.
- Add BullMQ job với `jobId=eventId`; chỉ đánh dấu dispatched sau khi queue xác nhận.
- Crash giữa add/update được phép dispatch lại; consumer tự idempotent.
- Handler sample dùng MongoDB transaction để ghi unique `JobExecution` và sample effect.
- Duplicate event trả `alreadyProcessed`, không lặp effect.
- Test-only fixture cho phép fail trước effect ở attempt đầu; production config không expose cơ chế này.
- Failed event giữ last error đã sanitize và có giới hạn retry/dead-letter state.

**Test:** first-attempt failure, retry success, duplicate dispatch, worker restart và stale-lock reclaim.

**Nghiệm thu:** cùng event ID chỉ tạo đúng một effect quan sát được.

### S1-C05 — CI integration

**Phụ thuộc:** S1-A06, S1-B06, S1-C04.

**Công việc:**

- Test job start Compose test profile với database/volume riêng.
- Chờ healthcheck, chạy migration, integration test và outbox/worker test.
- Teardown trong bước `always()`; thu log container khi fail.
- Không upload `.env`, volume, credential hoặc database dump.
- Quality job chạy `api:check`; build job build package, API, worker và web.
- Install vẫn frozen lockfile và ignore dependency scripts chưa allowlist.
- Đặt timeout/concurrency; workflow token giữ read-only tối thiểu.

**Nghiệm thu:** CI chạy từ runner sạch và không phụ thuộc state máy developer.

### S1-C06 — Infrastructure verification

**Phụ thuộc:** S1-C02, S1-C04, S1-C05.

**Kịch bản bắt buộc:**

- Fresh start từ volume rỗng.
- Restart container giữ dữ liệu local.
- MongoDB report primary và chạy transaction.
- Redis credential sai bị từ chối.
- MinIO private bucket không đọc anonymous.
- Port conflict/Docker unavailable báo lỗi rõ.
- Reset không thể tác động volume/project ngoài Dike.
- Worker retry và idempotency chạy trên service thật.

**Nghiệm thu:** test lặp lại được và không để container/test volume rác trong CI.

---

## 6. Mốc tích hợp

### Mốc 1 — Workspace contract

- B merge shared config/package skeleton trước.
- A chốt error/request-ID/OpenAPI interface.
- C chốt port, environment name và Compose project.
- Chưa generate client trước khi OpenAPI ổn định.

### Mốc 2 — Ba nhánh song song

- A làm API, database, health và transaction.
- B làm web, UI và shared packages.
- C làm Docker, orchestration và worker bootstrap.
- Mỗi nhánh rebase/pull `main` trước điểm bàn giao; không tự sửa lockfile conflict ngoài owner B.

### Mốc 3 — Bàn giao contract

- A bàn giao OpenAPI deterministic cho B sinh client.
- A bàn giao outbox schema/repository cho C nối dispatcher.
- C bàn giao connection/environment contract cho A/B.
- Contract change sau bàn giao cần changelog ngắn và cập nhật test consumer.

### Mốc 4 — Integration gate

Merge theo thứ tự:

1. Shared config/contracts.
2. Local infrastructure/orchestration.
3. API/database/outbox persistence.
4. Worker/dispatcher.
5. Generated client/web.
6. CI integration và documentation.

Chạy toàn bộ test trên fresh Docker volumes; không skip transaction/retry test để làm CI xanh.

---

## 7. Test plan tổng hợp

### Unit

- Config boundaries, request ID, error mapping và log redaction.
- Outbox state transition và job payload validation.
- UI token/component states và API client wrapper.

### Integration

- MongoDB transaction commit/rollback trên replica set thật.
- Migration lock/checksum/idempotency và seed guard.
- Redis auth, BullMQ retry, duplicate event và stale lock.
- MinIO health và private bucket policy.

### Contract/API

- Health contract và error envelope qua HTTP.
- OpenAPI generation deterministic.
- Generated client drift và client consumption từ web.

### Web

- App shell render desktop/mobile.
- Loading, ready, dependency-down, offline và retry.
- Keyboard/focus/accessibility checks; không có lỗi contrast WCAG AA nghiêm trọng.

### Security

- CORS ngoài allowlist, body quá giới hạn, field thừa và invalid request ID.
- Error/log/artifact không chứa secret hoặc internal connection data.
- Container chỉ bind loopback; Redis/MinIO credential bắt buộc.
- Secret scan và production dependency audit.

---

## 8. Definition of Done

Stage 1 chỉ hoàn thành khi:

1. Fresh clone chạy được:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm dev
```

2. Trong tối đa 120 giây:
   - Web chạy tại `http://localhost:3000`.
   - API chạy tại `http://localhost:3001/api/v1`.
   - Live và ready trả `200` khi dependency healthy.
   - Worker kết nối queue và bắt đầu outbox polling.
3. Dừng MongoDB hoặc Redis làm ready trả `503`, live vẫn `200`.
4. Test chứng minh transaction commit đủ và rollback toàn bộ.
5. Test chứng minh attempt đầu fail, retry thành công và duplicate event không lặp effect.
6. Migration/index/seed idempotent; concurrent runner an toàn; production seed/reset bị chặn.
7. OpenAPI deterministic; generated client build được; drift làm `api:check` fail.
8. Web sử dụng generated client và có đầy đủ foundation states.
9. Không có credential/PII trong Git, log hoặc CI artifact; private bucket không đọc anonymous.
10. Các lệnh sau thành công local và GitHub Actions:

```bash
corepack pnpm run ci
corepack pnpm security:audit
```

11. README ghi setup, port, reset, troubleshooting và giới hạn đã biết.
12. Không có auth, domain feature hoặc dữ liệu legacy bị triển khai ngoài phạm vi.

---

## 9. Ngoài phạm vi và giả định đã khóa

- Dùng `Member A/B/C`; thay bằng GitHub handle thật khi assign issue.
- Phân công theo subsystem, không luân phiên trong Stage 1.
- Docker Desktop/Engine là dependency bắt buộc cho integration local.
- `pnpm dev` tự start infrastructure nhưng không tự xóa volume.
- Stage 1 không triển khai Google login, OTP, user profile, Socket.IO nghiệp vụ, Goong hoặc Cloudflare R2 thật.
- Không có dữ liệu legacy; seed chỉ chứa dữ liệu tổng hợp.
- Single-node replica set được chấp nhận cho local/test; Atlas chịu trách nhiệm HA ở hosted environment.
- Sample outbox effect chỉ chứng minh transaction/retry/idempotency, không phải nghiệp vụ sản phẩm.
- Mobile chưa được scaffold; `api-client` và token được thiết kế để tái sử dụng sau.
- CI/review advisory theo ADR-0007; security-critical failure vẫn phải xử lý trước production.
