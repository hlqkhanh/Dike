# Giai đoạn 2 — Google authentication và session

## 1. Mục tiêu và quyết định kiến trúc

Giai đoạn 2 xây dựng authentication và session dùng được cho hệ thống thật, dựa trên nền tảng của Giai đoạn 1. NestJS là nguồn sự thật duy nhất về danh tính, người dùng và session; Next.js đóng vai trò Backend for Frontend (BFF) để quản lý cookie cùng origin và không giữ một hệ thống session riêng.

Giai đoạn hoàn thành khi người dùng có thể đăng nhập Google, bổ sung số điện thoại, refresh session, xem và thu hồi session theo thiết bị, logout thiết bị hiện tại hoặc toàn bộ thiết bị bằng E2E test. Không được tồn tại demo header, hard-coded user hoặc đường tắt giả mạo danh tính.

### 1.1. Kiến trúc đã khóa

```text
Browser
  │
  │ Same-origin cookie + CSRF
  ▼
Next.js BFF Route Handlers
  │
  │ Internal signed request
  ▼
NestJS API
  ├── Google/Mock OIDC provider
  ├── MongoDB: User, AuthIdentity, Session, AuditLog
  └── Redis: OAuth transaction, rate limit, replay protection
```

- NestJS quản lý `User`, `AuthIdentity`, opaque session và authorization policy.
- Next.js BFF giữ cookie HttpOnly, chuyển tiếp các request allowlist và không tự quản lý identity.
- Browser không nhận Google token hoặc opaque session token trong JavaScript.
- Không dùng Auth.js/NextAuth vì sẽ tạo thêm một nguồn quản lý session ngoài backend.
- Web dùng Authorization Code với PKCE S256, `state` và `nonce` riêng cho từng transaction.
- Local/test mặc định dùng Mock OIDC có redirect/code exchange thật; developer có thể chuyển sang Google thật bằng cấu hình.
- Access session hết hạn sau 15 phút.
- Refresh session hết hạn tuyệt đối sau 30 ngày và không sliding.
- Mỗi user có tối đa 10 session thiết bị đang hoạt động.
- `REQUIRE_PHONE_OTP=false` chỉ được phép ở local/test; số điện thoại vẫn phải lưu là `UNVERIFIED`.
- Email và số điện thoại không bao giờ được dùng để tự động merge account, kể cả khi Google trả `email_verified=true`.
- Giai đoạn 2 không lưu Google access token hoặc Google refresh token.

Thiết kế tuân theo:

- [Google OpenID Connect server flow](https://developers.google.com/identity/openid-connect/openid-connect).
- [OAuth Security Best Current Practice — RFC 9700](https://datatracker.ietf.org/doc/html/rfc9700).
- [OAuth for Browser-Based Applications — RFC 10017](https://datatracker.ietf.org/doc/html/rfc10017).
- [Next.js Backend for Frontend guidance](https://nextjs.org/docs/app/guides/backend-for-frontend).
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).
- [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).

### 1.2. Ngoài phạm vi

- Không gửi hoặc xác minh OTP; chức năng này thuộc Giai đoạn 3.
- Không có password, magic link hoặc social provider khác.
- Không triển khai role, driver hoặc admin authorization.
- Không có account linking/recovery tự phục vụ.
- Không triển khai OAuth cho mobile.
- Không coi Mock OIDC là production feature.
- “Revoke” trong giai đoạn này là revoke Dike session, không phải revoke quyền Google.
- Production rollout cho nghiệp vụ yêu cầu verified phone bị chặn cho tới khi Giai đoạn 3 hoàn thành.

## 2. Public interface và contract

### 2.1. Next.js BFF interface

Browser chỉ gọi các endpoint cùng origin sau:

```text
GET    /api/health
GET    /api/auth/google/start?returnTo=/app
GET    /api/auth/google/callback
GET    /api/auth/session
POST   /api/auth/session/refresh
POST   /api/auth/logout
POST   /api/auth/logout-all
GET    /api/auth/sessions
DELETE /api/auth/sessions/:sessionId
PUT    /api/auth/phone
GET    /api/me
```

Quy tắc BFF:

- Không tạo generic proxy nhận URL động.
- Chỉ proxy route nằm trong allowlist cố định.
- Không forward `authorization`, `cookie`, hop-by-hop header hoặc header tùy ý từ browser.
- Tự chèn access/refresh token đọc từ cookie HttpOnly.
- Ký mọi request từ BFF đến API.
- Forward `x-request-id` nếu là UUID hợp lệ; nếu không thì sinh UUID mới.
- Auth response luôn có `Cache-Control: no-store, private`.
- Không trả provider error, token, stack trace hoặc hostname nội bộ cho browser.
- `returnTo` chỉ cho phép `/app`, `/onboarding/phone` và `/settings/sessions`.
- Từ chối URL có scheme, host, `//`, backslash, encoded traversal hoặc path ngoài allowlist.

### 2.2. NestJS API interface

```text
POST   /api/v1/auth/google/start
POST   /api/v1/auth/google/callback
GET    /api/v1/auth/session
POST   /api/v1/auth/session/refresh
POST   /api/v1/auth/logout
POST   /api/v1/auth/logout-all
GET    /api/v1/auth/sessions
DELETE /api/v1/auth/sessions/:sessionId
PUT    /api/v1/auth/phone
GET    /api/v1/me
```

Các endpoint phát hành hoặc luân chuyển token chỉ nhận request đã qua `InternalBffGuard`.

BFF ký request bằng các header:

```text
x-dike-bff-key-id
x-dike-bff-timestamp
x-dike-bff-nonce
x-dike-bff-signature
```

Canonical payload:

```text
HTTP_METHOD
REQUEST_PATH
REQUEST_ID
TIMESTAMP
NONCE
SHA256_RAW_BODY
```

API phải:

- Xác thực HMAC bằng constant-time comparison.
- Chỉ cho phép lệch thời gian tối đa 30 giây.
- Lưu nonce trong Redis 2 phút để chống replay.
- Từ chối key ID không nằm trong keyring.
- Không log signature, request body chứa token hoặc raw callback URL.

### 2.3. Response contract

```ts
type PhoneStatus = 'NONE' | 'UNVERIFIED' | 'VERIFIED';

type OnboardingNextAction = 'PHONE_REQUIRED' | 'PHONE_VERIFICATION_REQUIRED' | 'NONE';

interface DeviceSummary {
  browser: string;
  operatingSystem: string;
  deviceType: 'DESKTOP' | 'MOBILE' | 'TABLET' | 'UNKNOWN';
}

interface AuthSessionView {
  authenticated: true;
  csrfToken: string;
  user: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
    phoneStatus: PhoneStatus;
    maskedPhone: string | null;
  };
  session: {
    id: string;
    current: true;
    createdAt: string;
    lastSeenAt: string;
    accessExpiresAt: string;
    absoluteExpiresAt: string;
    device: DeviceSummary;
  };
  onboarding: {
    nextAction: OnboardingNextAction;
  };
}

interface AnonymousSessionView {
  authenticated: false;
}

interface DeviceSessionView {
  id: string;
  current: boolean;
  device: DeviceSummary;
  createdAt: string;
  lastSeenAt: string;
  absoluteExpiresAt: string;
}
```

`onboarding.nextAction` được tính động:

- Chưa có phone: `PHONE_REQUIRED`.
- Phone `UNVERIFIED` và OTP bắt buộc: `PHONE_VERIFICATION_REQUIRED`.
- Phone `UNVERIFIED`, environment là local/test và `REQUIRE_PHONE_OTP=false`: `NONE`.
- Phone `VERIFIED`: `NONE`.

Không ghi trạng thái “verified giả” vào database.

### 2.4. Error code

Giữ nguyên error envelope Giai đoạn 1 và bổ sung:

```text
OAUTH_TRANSACTION_EXPIRED
OAUTH_STATE_INVALID
OAUTH_PROVIDER_DENIED
OAUTH_CODE_INVALID
IDENTITY_TOKEN_INVALID
ACCOUNT_LINK_REVIEW_REQUIRED
SESSION_REQUIRED
SESSION_EXPIRED
SESSION_REVOKED
SESSION_REFRESH_REQUIRED
SESSION_REFRESHED
REFRESH_TOKEN_REUSED
CSRF_INVALID
ORIGIN_NOT_ALLOWED
PHONE_INVALID
RATE_LIMITED
INTERNAL_CLIENT_UNAUTHORIZED
```

Error gửi cho browser dùng message tổng quát. Provider response chi tiết chỉ được chuyển thành reason code đã sanitize trong audit log.

## 3. Data model và security policy

### 3.1. `User`

Các field:

- `_id`.
- `status`: `ACTIVE | SUSPENDED | DELETED`; Giai đoạn 2 chỉ tạo `ACTIVE`.
- `displayName`.
- `avatarUrl`.
- `phoneCiphertext`, `phoneIv`, `phoneAuthTag`, `phoneKeyId`.
- `phoneLookupHash`.
- `phoneStatus`: `NONE | UNVERIFIED | VERIFIED`.
- `phoneUpdatedAt`.
- `createdAt`, `updatedAt`.

Quy tắc:

- Phone được normalize sang E.164, mặc định vùng Việt Nam.
- Chấp nhận cả `0xxxxxxxxx` và `+84xxxxxxxxx` nếu hợp lệ.
- Chỉ lưu phone đã mã hóa và lookup HMAC.
- Giai đoạn 2 chưa tạo unique index cho phone chưa xác minh.
- Một số chưa xác minh có thể xuất hiện ở nhiều account nhưng không được dùng để merge.
- API chỉ trả masked phone.

### 3.2. `AuthIdentity`

Các field:

- `_id`.
- `provider`: `GOOGLE`.
- `providerSubject`: Google `sub`.
- `userId`.
- `emailCiphertext`, IV, auth tag và key ID.
- `emailLookupHash`.
- `emailVerified`.
- `providerDisplayName`.
- `providerAvatarUrl`.
- `lastLoginAt`.
- `createdAt`, `updatedAt`.

Indexes:

- Unique `{provider, providerSubject}`.
- Index `emailLookupHash`.
- Index `userId`.

Quy tắc account linking:

- `provider + sub` là identity key duy nhất.
- Cùng `sub` phải trả về cùng identity/user.
- Email không phải identity key.
- Nếu `sub` mới có email trùng identity khác, không merge và không tạo account mới; trả lỗi tổng quát và ghi audit `ACCOUNT_LINK_REVIEW_REQUIRED`.
- Manual account linking/recovery nằm ngoài Giai đoạn 2.

### 3.3. `Session`

Các field:

- `sessionId`: UUID.
- `userId`.
- `accessTokenHash`, `accessTokenKeyId`, `accessExpiresAt`.
- `refreshTokenHash`, `refreshTokenKeyId`.
- `previousRefreshTokenHash`, `previousRefreshValidUntil`.
- `refreshCounter`.
- `absoluteExpiresAt`.
- `createdAt`, `lastSeenAt`, `lastRefreshedAt`.
- `revokedAt`, `revokedReason`.
- `deviceSummary`.
- `ipHash`.
- `purgeAt`.

Indexes:

- Unique access-token hash.
- Unique refresh-token hash.
- Unique session ID.
- `{userId, revokedAt, lastSeenAt}`.
- TTL `purgeAt`.

Không dựa vào TTL index để xác thực expiry vì MongoDB TTL cleanup không chạy tức thời. Session service luôn tự kiểm tra timestamp.

### 3.4. `AuditLog`

Audit log là append-only, gồm:

- `event`.
- `outcome`.
- `reasonCode`.
- `userId`, `identityId`, `sessionId` nếu có.
- `requestId`.
- `ipHash`.
- `deviceSummary`.
- `createdAt`.

Không ghi:

- Access/refresh token.
- Authorization code.
- State, nonce hoặc PKCE verifier.
- Google ID/access token.
- Email hoặc phone đầy đủ.
- Raw IP hoặc raw user-agent.
- Provider stack/error response.

### 3.5. Token và cookie policy

Opaque token:

- Sinh 32 byte bằng CSPRNG và encode base64url.
- Database chỉ lưu HMAC-SHA-256 của token.
- Mỗi purpose dùng key dẫn xuất riêng.
- Không dùng hash không có secret cho session token.
- Token mới luôn dùng active key; validation thử các verification key còn hiệu lực.

Cookie production:

```text
__Host-dike_access
  HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=900

__Secure-dike_refresh
  HttpOnly; Secure; SameSite=Lax; Path=/api/auth; Max-Age=2592000

__Secure-dike_oauth_tx
  HttpOnly; Secure; SameSite=Lax; Path=/api/auth/google; Max-Age=600
```

Local HTTP dùng tên không có prefix `__Host-`/`__Secure-` và `Secure=false`. Production phải fail-fast nếu URL không phải HTTPS hoặc secure cookie bị vô hiệu hóa.

### 3.6. Mã hóa và keyring

- Token lookup dùng HMAC-SHA-256.
- PII dùng AES-256-GCM với random IV.
- AAD của PII gồm entity type, entity ID và field name.
- Session, PII, CSRF và BFF signature dùng key material tách biệt.
- Mỗi keyring có active key ID và tập verification/decryption key cũ.
- Key mới dùng để ghi; key cũ chỉ dùng để verify/decrypt trong thời gian rotation.
- Production từ chối key ngắn, placeholder hoặc trùng purpose.
- Không đưa key dùng được vào `.env.example`, test fixture, log hoặc artifact.

## 4. Luồng nghiệp vụ chi tiết

### 4.1. OAuth transaction

`GET /api/auth/google/start` thực hiện:

1. BFF validate `returnTo`.
2. BFF gọi API start bằng signed request.
3. API tạo transaction token, `state`, `nonce` và PKCE verifier bằng CSPRNG.
4. API tạo PKCE S256 challenge.
5. API mã hóa transaction payload và lưu Redis trong 10 phút.
6. BFF lưu transaction token trong cookie HttpOnly.
7. Browser được redirect đến provider.

Transaction Redis chứa:

- Hash của transaction token làm lookup key.
- State hash.
- Nonce.
- PKCE verifier.
- Provider.
- Redirect URI.
- Return path.
- Request metadata tối thiểu.

Callback:

1. Google/Mock redirect về Next.js BFF callback.
2. BFF lấy `code`, `state`, provider error và transaction cookie.
3. BFF gọi API callback bằng signed request.
4. API atomically consume transaction bằng `GETDEL` hoặc Lua.
5. API constant-time validate state.
6. API exchange code với PKCE verifier.
7. API validate ID token.
8. API tạo/cập nhật identity, user và session trong Mongo transaction.
9. API trả opaque token cho BFF qua internal response.
10. BFF set cookie, xóa transaction cookie và trả `303` đến return path.
11. Không đưa token, code hoặc state vào redirect URL.

Transaction bị consume cả khi provider trả `access_denied`, nếu callback mang transaction hợp lệ, để không thể replay.

### 4.2. Google token validation

Dùng `jose` và Google JWKS:

- Algorithm allowlist `RS256`.
- Validate signature.
- `iss` chỉ cho phép Google issuer chính thức.
- `aud` phải khớp chính xác client ID.
- Validate `azp` nếu claim xuất hiện.
- Validate `exp`, `iat`, clock skew tối đa 60 giây.
- Validate `nonce`.
- Bắt buộc có `sub`.
- Bắt buộc `email_verified=true`.
- Không dùng email local-part làm display-name fallback.
- Chỉ request scope `openid email profile`.
- Không request offline access.
- Không lưu Google access token hoặc Google refresh token.
- Code exchange timeout 5 giây, không retry tự động và không follow redirect tùy ý.
- JWKS cache theo HTTP caching và refresh khi gặp `kid` mới.

### 4.3. Session rotation và revocation

- Mỗi login tạo một device session mới.
- Khi đã có 10 active sessions, transaction login revoke session có `lastSeenAt` cũ nhất với reason `SESSION_LIMIT`.
- Access token hết hạn sau 15 phút.
- Refresh không kéo dài `absoluteExpiresAt` 30 ngày.
- Mỗi refresh rotate cả access và refresh token bằng atomic conditional update.
- Giữ hash refresh token trước trong 10 giây để xử lý hai tab refresh đồng thời.
- Token cũ dùng trong grace window trả `SESSION_REFRESHED`; BFF không xóa cookie và client đọc cookie mới rồi retry.
- Token cũ dùng lại sau grace window được xem là reuse, revoke toàn bộ device session, ghi audit và xóa cookie.
- `lastSeenAt` chỉ ghi tối đa một lần mỗi 5 phút để tránh write amplification.
- Không khóa session theo IP vì người dùng mobile có thể đổi mạng; IP chỉ phục vụ rate limit và audit.
- Logout current, logout-all và revoke device đều idempotent.
- Revoke session phải query theo cả `userId` và `sessionId` để chống IDOR.
- Revoke current session đồng thời xóa cookie hiện tại.

### 4.4. CSRF, origin và rate limit

Mọi mutation BFF phải:

- Kiểm tra `Origin` khớp chính xác `WEB_BASE_URL`.
- Từ chối Origin thiếu ở browser request, trừ server/test client được cấu hình riêng.
- Yêu cầu `x-csrf-token`.
- CSRF token được API dẫn xuất từ session ID và `refreshCounter`, trả qua session JSON và chỉ giữ trong memory phía web.
- Rotate CSRF token khi refresh.
- OAuth callback dùng state/nonce/PKCE nên không yêu cầu CSRF header.

Rate limit Redis mặc định:

| Thao tác       |                                        Giới hạn |
| -------------- | ----------------------------------------------: |
| Login start    |                               10 lần/10 phút/IP |
| OAuth callback | 20 lần/10 phút/IP; transaction chỉ dùng một lần |
| Refresh        |             30 lần/phút/session, 60 lần/phút/IP |
| Phone update   |                   5 lần/giờ/user, 10 lần/giờ/IP |
| Logout/revoke  |                                30 lần/phút/user |

- Trả `429` và `Retry-After`.
- Auth mutation fail-closed nếu Redis không sẵn sàng.
- Chỉ tin `X-Forwarded-For` theo số proxy hop được cấu hình chính xác.
- Raw IP được HMAC trước khi dùng làm storage/rate-limit key.

### 4.5. Web session lifecycle

- Auth state dùng TanStack Query.
- Không lưu credential hoặc CSRF token trong persistent browser storage.
- Khi request protected trả access-expired:
  1. Chỉ cho phép một refresh promise trong mỗi tab.
  2. Refresh một lần.
  3. Retry request ban đầu một lần.
  4. Không tạo refresh loop.
- Dùng `BroadcastChannel` để đồng bộ logout/revoke giữa các tab.
- Route guard phía web chỉ phục vụ UX; API luôn là authorization authority.
- Khi không có access cookie nhưng còn refresh cookie, session endpoint trả `SESSION_REFRESH_REQUIRED`; không dùng GET để âm thầm rotate session.
- Khi session bị revoke, BFF xóa cả access và refresh cookie rồi trả anonymous state.

## 5. Phân công cho ba thành viên

### S2-00 — Baseline chung

Trước khi tách nhánh:

- Chạy `corepack pnpm install --frozen-lockfile` vì local `node_modules` hiện có dấu hiệu thiếu hoặc cũ.
- Chạy lint, typecheck, unit test, build, API drift check và Giai đoạn 1 integration.
- Nếu vẫn lỗi sau fresh install, sửa baseline bằng commit riêng, không trộn vào auth.
- Chốt OpenAPI operation ID, endpoint, DTO và environment contract.
- Member B tiếp tục là người duy nhất cập nhật root manifest và `pnpm-lock.yaml`.

### Member A — Backend identity, user và session

#### S2-A01 — Auth module boundary

- Tạo `AuthModule` cho orchestration/controller.
- Tạo `IdentityModule` cho provider abstraction và `AuthIdentity`.
- Tạo `SessionModule` cho opaque session, guard và rotation.
- Tạo `UserModule` cho profile, phone onboarding và `/me`.
- Tạo `AuditModule` cho security audit.
- Tạo `SecurityModule` cho crypto/keyring, CSRF và internal BFF guard.
- Controller không truy cập trực tiếp Mongoose model.
- Mutation phải đi qua application service và repository.
- Không tạo circular dependency.
- OpenAPI mode khởi tạo được mà không cần Google/Redis/Mongo connection.
- Runtime mode fail-fast nếu thiếu secret bắt buộc.

#### S2-A02 — Crypto và keyring

- Implement token HMAC service.
- Implement AES-256-GCM PII encryption service.
- Mỗi encrypted value dùng random IV và AAD đúng entity/field.
- Hỗ trợ active key ID và verification/decryption key cũ.
- Tách key material theo purpose.
- Viết test tampering, sai AAD, key rotation và constant-time comparison.

#### S2-A03 — Schema và migration

- Tạo schema/repository cho `User`, `AuthIdentity`, `Session`, `AuditLog`.
- Tạo migration forward-only cho collection và index.
- Migration chạy lại phải idempotent.
- Unique index phải xử lý được concurrent callback.
- Seed chỉ chứa synthetic local/test data khi test cần.
- Không tạo account đăng nhập bí mật trong seed.

#### S2-A04 — Provider abstraction và Google adapter

```ts
interface IdentityProvider {
  createAuthorizationRequest(input: AuthorizationInput): AuthorizationRequest;
  exchangeAuthorizationCode(input: CallbackInput): Promise<VerifiedIdentity>;
}
```

- Implement Google adapter.
- Validate metadata/token theo mục 4.2.
- Map provider error sang internal reason code.
- Không log HTTP body từ Google.
- Không retry authorization-code exchange.

#### S2-A05 — OAuth transaction và callback

- Redis encrypted transaction store với TTL 10 phút.
- Atomic consume và replay protection.
- Validate state, nonce và PKCE.
- Tạo/cập nhật identity bằng Mongo transaction.
- Xử lý concurrent login của cùng `sub`.
- Phát hiện same-email/different-sub nhưng không merge.
- Tạo session trong cùng transaction với identity/user update và audit success.
- Callback thất bại không để lại user/session một phần.

#### S2-A06 — Session service

- Sinh, hash, validate và rotate access/refresh token.
- Access guard trả error code ổn định.
- Refresh atomic conditional update theo token hash và counter.
- Implement 10-second concurrency grace và reuse detection.
- Enforce tối đa 10 session/user.
- Implement logout current, logout-all và revoke device.
- Mọi authorization query kiểm tra user status, revoke state và expiry.

#### S2-A07 — User onboarding

- Implement `GET /me`.
- Implement `PUT /auth/phone`.
- Normalize phone E.164.
- Encrypt phone, tạo lookup hash và đặt `UNVERIFIED`.
- Cho phép thay phone chưa xác minh.
- Không cho client tự gửi phone status.
- Không tạo OTP code hoặc OTP endpoint.
- Tính onboarding action dựa trên environment policy.

#### S2-A08 — Backend tests

- Google token validation.
- State/nonce/PKCE mismatch và replay.
- Concurrent callback và identity idempotency.
- Same-email/different-sub conflict.
- Transaction rollback.
- Token hash-only storage.
- Refresh rotation, race và reuse.
- Max-session eviction.
- Logout/revoke và IDOR protection.
- Phone encryption/normalization.
- BFF signature, timestamp và nonce replay.
- Rate-limit và Redis failure.

### Member B — Next.js BFF và auth UI

#### S2-B01 — BFF foundation

- Thêm server-only `API_INTERNAL_URL`.
- Chuyển health card sang explicit `/api/health` BFF route.
- Không dùng `NEXT_PUBLIC_API_URL` cho auth.
- Tạo internal API client bằng generated OpenAPI client.
- Tạo BFF signature middleware.
- Tạo cookie utility với production/local policy rõ ràng.
- Tạo exact Origin/CSRF validation.
- Không tạo catch-all proxy.

#### S2-B02 — Login start và callback

- Login button dùng full-page navigation đến BFF start route.
- Start route validate `returnTo`, gọi API và set transaction cookie.
- Callback không render code/state ra HTML.
- Callback gọi API, set access/refresh cookie và clear transaction cookie ở cả success/failure.
- Callback trả `303` đến return path.
- Chỉ đưa error code allowlist về `/login`.
- Login page có loading, provider unavailable, denied và expired transaction state.
- Không có query/header cho phép chọn user ngoài Mock IdP UI.

#### S2-B03 — Session adapter

- Implement BFF session, refresh, logout, logout-all, list/revoke session, phone và `/me`.
- BFF không log request/response body auth.
- Cookie clear dùng đúng name/path/secure attributes lúc set.
- Session route phân biệt anonymous, refresh-required và revoked.
- Regenerate API client sau khi OpenAPI của Member A ổn định.

#### S2-B04 — Web auth state

- Tạo auth query/provider bằng TanStack Query.
- Không lưu credential hoặc CSRF token trong persistent storage.
- Implement refresh single-flight và retry đúng một lần.
- Không tạo refresh loop.
- Dùng `BroadcastChannel` để đồng bộ logout/revoke giữa các tab.
- Route guard web chỉ phục vụ UX.

#### S2-B05 — Auth screens

Tạo:

```text
/login
/onboarding/phone
/app
/settings/sessions
```

Yêu cầu:

- Login Google rõ ràng và đúng brand guideline.
- Phone form có label, `autocomplete="tel"`, `inputMode="tel"` và accessible error.
- Không hiển thị phone đầy đủ sau khi lưu.
- Local/test hiển thị rõ phone vẫn chưa xác minh.
- Session list có device summary, last active, expiry và “thiết bị hiện tại”.
- Revoke thiết bị và logout-all có confirmation.
- Có loading, empty, offline, rate-limited và generic error state.
- Focus management và screen-reader announcement cho lỗi.

#### S2-B06 — Web security tests

- Cookie flags ở local và production.
- Open redirect payload.
- CSRF và Origin rejection.
- Header stripping.
- No-cache auth response.
- Không có token trong DOM, URL, localStorage, sessionStorage hoặc client response JSON.
- Refresh single-flight.
- Multi-tab logout.
- Revoke current session.
- Accessibility bằng React Testing Library và axe-compatible checks.

### Member C — Mock provider, security infrastructure và E2E

#### S2-C01 — Environment contract

Bổ sung config được validate:

```text
AUTH_PROVIDER=google|mock
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI
MOCK_OIDC_ISSUER
WEB_BASE_URL
API_INTERNAL_URL
AUTH_ACCESS_TTL_SECONDS=900
AUTH_REFRESH_ABSOLUTE_TTL_SECONDS=2592000
AUTH_REFRESH_REUSE_GRACE_SECONDS=10
AUTH_MAX_SESSIONS=10
AUTH_TRANSACTION_TTL_SECONDS=600
AUTH_TOKEN_KEYRING
AUTH_TOKEN_ACTIVE_KEY_ID
PII_KEYRING
PII_ACTIVE_KEY_ID
CSRF_KEYRING
CSRF_ACTIVE_KEY_ID
BFF_KEYRING
BFF_ACTIVE_KEY_ID
REQUIRE_PHONE_OTP
TRUST_PROXY_HOPS
```

Guards:

- `mock` chỉ local/test.
- `REQUIRE_PHONE_OTP=false` chỉ local/test.
- Production yêu cầu HTTPS.
- Không secret nào có prefix `NEXT_PUBLIC_`.
- `.env.example` chỉ chứa placeholder.
- Local credential generator sinh secret ngẫu nhiên và không log secret.

#### S2-C02 — Mock OIDC provider

Tạo workspace `@dike/mock-idp` trong `tools/mock-idp`:

```text
/.well-known/openid-configuration
/authorize
/token
/jwks
```

Mock provider phải:

- Thực hiện redirect/code exchange thật.
- Validate client ID và redirect URI exact.
- Enforce PKCE S256.
- Carry nonce vào signed ID token.
- Code chỉ dùng một lần và có TTL.
- Có consent/account-selection page rõ ràng.
- Chỉ dùng synthetic account với domain `.invalid`.
- Bind localhost trong local.
- Refuse startup ngoài local/test.
- Không hỗ trợ identity header hoặc query-param impersonation.

`pnpm dev` khởi động mock provider khi `AUTH_PROVIDER=mock`; thêm `pnpm dev:google` để dùng Google thật mà không chạy mock.

#### S2-C03 — Rate limit và replay infrastructure

- Redis namespace riêng cho OAuth transaction, BFF nonce và rate limit.
- Atomic increment/expiry.
- Không lưu raw IP.
- Có clock-skew test.
- Redis outage trả lỗi kiểm soát được, không bypass security.

#### S2-C04 — Audit và log hardening

Mở rộng Pino redaction cho:

```text
authorization
cookie
set-cookie
code
state
nonce
code_verifier
id_token
access_token
refresh_token
client_secret
phone
email
bff signature
```

- Không log `req.originalUrl` có callback query.
- Chỉ log route template/path không query.
- Test quét captured logs để bảo đảm secret/PII không xuất hiện.
- Audit event dùng reason code allowlist.

#### S2-C05 — Playwright E2E

E2E dùng Mock IdP và infrastructure thật:

1. New user login.
2. State/nonce/PKCE round-trip.
3. Nhập phone.
4. Phone vẫn `UNVERIFIED`.
5. Local bypass cho phép vào `/app`.
6. Reload giữ session.
7. Access expiry dẫn đến refresh.
8. Logout current.
9. Login hai thiết bị/browser context.
10. Revoke một thiết bị.
11. Logout-all.
12. Provider denied.
13. Transaction expired.
14. Callback replay.
15. Refresh token reuse.
16. Same email/different subject không merge.

Không dùng live Google account trong CI.

#### S2-C06 — CI và security validation

- Tạo auth E2E job với fresh Mongo/Redis/MinIO volumes.
- Start Mock IdP, API, web và worker.
- Chờ health thay vì fixed sleep.
- Chạy migration trước test.
- Chạy auth integration và Playwright.
- Luôn teardown và thu sanitized logs khi fail.
- Không upload cookie, `.env`, database dump hoặc trace chứa token.
- Chạy secret scan, dependency audit, OpenAPI drift và build.
- Trace/video chỉ bật với synthetic test account và phải sanitize trước artifact upload.

#### S2-C07 — Runbook và threat model

Tài liệu phải mô tả:

- Cách tạo Google OAuth client.
- Redirect URI local/staging/production.
- Cách rotate keyring mà không làm mất session ngay lập tức.
- Cách revoke toàn bộ session khi có incident.
- Cách điều tra refresh-token reuse.
- Cách xử lý Google outage.
- Danh sách dữ liệu nhạy cảm và nơi lưu.
- Lý do production rollout bị chặn tới Giai đoạn 3 nếu phone verification là điều kiện nghiệp vụ.

## 6. Trình tự phối hợp

### Mốc 1 — Contract freeze

- Member A chốt DTO, error code, schema và OpenAPI operation ID.
- Member B chốt BFF route và cookie contract.
- Member C chốt environment, Mock IdP metadata và key format.
- Member B cập nhật root manifest/workspace và cài dependency theo một batch.

### Mốc 2 — Phát triển song song

```text
stage2/api-auth-session
stage2/web-bff-auth
stage2/auth-infra-e2e
```

- A phát triển backend bằng provider test double.
- B phát triển BFF/UI dựa trên contract đã khóa.
- C phát triển Mock IdP, Redis security utilities và E2E harness.

### Mốc 3 — Handoff

- C bàn giao Mock OIDC discovery/JWKS endpoint cho A.
- A bàn giao deterministic OpenAPI cho B.
- B regenerate client và chạy `api:check`.
- A/C bàn giao test fixture nhưng không thêm production backdoor.
- B resolve root manifest/lockfile conflict.
- C sở hữu `.env.example`, scripts và CI.

### Mốc 4 — Merge và integration

Thứ tự merge:

1. Shared contracts/config skeleton.
2. Mock IdP và environment contract.
3. Backend identity/session.
4. Generated API client.
5. Next.js BFF.
6. Auth UI.
7. E2E, CI và documentation.

Mỗi merge phải chạy lại Giai đoạn 1 regression để bảo đảm health, worker, outbox và app shell không bị phá vỡ.

## 7. Test plan

### 7.1. OAuth/OIDC

- PKCE challenge dùng S256.
- State, nonce và transaction đều unique.
- State/nonce sai bị từ chối.
- Callback hết hạn/replay bị từ chối.
- Invalid issuer, audience, signature, expiry, nonce và unverified email bị từ chối.
- Provider denial không lộ provider response.
- Authorization code không bị retry.
- Return URL độc hại bị từ chối.

### 7.2. Identity và data consistency

- Cùng Google `sub` không tạo identity/user trùng.
- Concurrent callback không tạo orphan.
- Same email/different `sub` không merge.
- Transaction lỗi rollback user, identity, session và audit success.
- Phone được normalize, encrypt và mask.
- Không có plaintext token/email/phone trong MongoDB.

### 7.3. Session

- Access hết hạn đúng 15 phút.
- Refresh không vượt quá 30 ngày kể từ login.
- Refresh rotate cả hai token.
- Hai tab refresh đồng thời không logout nhầm.
- Reuse sau grace revoke session.
- Session thứ 11 revoke session cũ nhất.
- Logout current không ảnh hưởng thiết bị khác.
- Logout-all revoke toàn bộ.
- Revoke session khác không bị IDOR.
- Revocation có hiệu lực ngay, không chờ access token expiry.

### 7.4. Browser/BFF

- Cookie production có đúng Secure, HttpOnly, SameSite và Path.
- `document.cookie` không đọc được auth cookie.
- Không credential trong localStorage/sessionStorage.
- Không token/code/state trong URL sau callback.
- Mutation thiếu CSRF hoặc sai Origin bị từ chối.
- BFF không proxy arbitrary URL/header.
- Auth response không được cache.
- Logout đồng bộ giữa nhiều tab.

### 7.5. Security và failure mode

- BFF signature sai, cũ hoặc replay bị từ chối.
- Spoofed `X-Forwarded-For` không vượt rate limit.
- Redis down không bypass OAuth/refresh.
- Google timeout trả lỗi an toàn.
- Mongo transaction failure không để lại partial account.
- Log scan không tìm thấy secret, token hoặc PII.
- Production config từ chối mock provider, insecure cookie và OTP bypass.

## 8. Definition of Done

Các lệnh sau phải thành công:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm run ci
corepack pnpm test:integration
corepack pnpm test:e2e:auth
corepack pnpm api:check
corepack pnpm security:audit
corepack pnpm security:secrets
```

Giai đoạn 2 chỉ hoàn thành khi:

1. `pnpm dev` chạy Mock IdP, infrastructure, API, worker và web bằng một lệnh.
2. `pnpm dev:google` đăng nhập được bằng Google OAuth client thật.
3. Login, callback, onboarding phone, refresh, revoke, logout current và logout-all chạy E2E.
4. Phone local vẫn được lưu là `UNVERIFIED`.
5. Không tồn tại demo header, query impersonation, hard-coded user hoặc auth bypass.
6. Browser không nhận session token qua JavaScript.
7. Database và log không chứa plaintext credential hoặc PII nhạy cảm.
8. Same-email/different-sub không tự merge.
9. OpenAPI và generated client deterministic.
10. Giai đoạn 1 tests vẫn xanh.
11. Google manual smoke test có checklist; Google credential thật không xuất hiện trong CI.
12. Production deployment bị chặn cho tới Giai đoạn 3 nếu phone verification là điều kiện nghiệp vụ bắt buộc.
