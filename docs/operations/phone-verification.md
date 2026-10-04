# Phone verification and account roles

Stage 3 implements local/test OTP and reusable account authorization. The production adapter is deliberately disabled until `S3-PILOT-01` is completed. This is not a production/pilot release.

## Local setup

Use Node 22 and `corepack pnpm install --frozen-lockfile`, then `corepack pnpm dev`. The environment generator adds independent random OTP key material. On an existing Stage 2 checkout, explicitly change `REQUIRE_PHONE_OTP=false` to `true` in your ignored `.env.local`; existing values are preserved by the generator.

Required local/test settings:

```dotenv
OTP_PROVIDER=fake
OTP_DEV_EXPOSE_CODE=true
OTP_CODE_ACTIVE_KEY_ID=local
REQUIRE_PHONE_OTP=true
```

`OTP_CODE_KEYRING` is a JSON object of key IDs to independent random secrets of at least 32 characters. Use the environment generator to create it; do not reuse a session, PII, CSRF or BFF key. Codes are shown only in local/test when the fake provider and development-code flag are enabled. They are never written to application logs or databases. Do not record the onboarding screen or export browser traces containing a development code.

Run migrations before starting the application. Migration `20261004-003-phone-verification-roles` backfills roles and versions, replaces the old phone index with a partial unique index for verified phones, and creates the authorization revision singleton. Duplicate verified-phone conflicts stop the migration with a sanitized error; investigate using authorized operational access, never automatically merge accounts.

## OTP behavior

- Six random digits, valid for five minutes; five wrong attempts per challenge.
- Resend cooldown is 60 seconds. Successful resend invalidates the prior challenge; provider failure preserves it.
- Send and verification limits cover user, phone HMAC, authenticated session HMAC and the API's trusted client IP HMAC. The API does not trust arbitrary forwarded IP headers. Configure the reverse proxy trust boundary before a hosted deployment; a BFF sharing one source IP shares the IP budget.
- All rate buckets are checked/incremented atomically. `429` includes `Retry-After` and the BFF preserves it.
- Redis is required. No in-memory fallback is allowed.
- Redis holds HMACs and metadata, never raw codes, raw phone numbers or raw IP addresses. Challenge metadata remains for up to 24 hours to distinguish expired/consumed challenges; the code expires after five minutes.
- An approved operation can retry across a database failure. The retry must still prove the code, phone version and session binding. MongoDB stores a challenge idempotency record and a transactional audit entry. The active challenge ID also fences a superseded operation at database finalization.
- Changing a phone removes verification and `VERIFIED_MEMBER`. Existing elevated grants are dormant until the new phone is verified. Re-entering the same normalized number is a no-op.

## Account authorization

Import `AuthorizationModule.register(true)` when adding protected domain modules. Apply `AuthorizationGuard` with `RequireRoles({ anyOf: [...] })` or `RequireRoles({ allOf: [...] })`. `AuthorizationService.require()` supports service-level checks. The guard resolves the opaque session and current database user for every request. Never trust browser role arrays or copy roles into session tokens.

`ADMIN` satisfies a `MODERATOR` requirement. It does not bypass inactive-account checks, phone verification or driver approval. `MEMBER` and `VERIFIED_MEMBER` are system-managed. Driver approval remains Stage 5 work.

```bash
corepack pnpm auth:role:list -- --user-id <id>
corepack pnpm auth:role:bootstrap-admin -- --user-id <id> --reason OPS-123 --confirm
corepack pnpm auth:role:grant -- --actor-id <admin-id> --user-id <id> --role MODERATOR --reason OPS-124
corepack pnpm auth:role:revoke -- --actor-id <admin-id> --user-id <id> --role MODERATOR --reason OPS-125
```

Use a ticket reference, not personal information, for `--reason`. Hosted changes also require `--confirm`. The CLI requires authorized database access and loads `.env.local`; use a securely provisioned ignored environment file on an operations host. Treat CLI/database access as privileged: `--actor-id` identifies the operator in audit, it is not an authentication credential. No admin is seeded. Bootstrap succeeds only while there are no effective admins. The singleton revision serializes admin changes, phone changes and verification; the last effective admin cannot revoke their role or change their phone.

## Hosted/pilot gate

Set `OTP_PROVIDER=disabled`, `OTP_DEV_EXPOSE_CODE=false`, `REQUIRE_PHONE_OTP=true`, Google OIDC and independent production keys. Hosted configuration rejects fake OTP and bypass flags. Readiness returns `503` with the OTP dependency down; liveness remains independent.

`S3-PILOT-01` remains open: choose and approve a vendor, implement its adapter, validate timeouts and sandbox contract, test carrier delivery, and establish cost alerts/global send budgets before enabling the pilot. Do not claim Stage 3 production completion while this gate is open.

## Verification

Run `corepack pnpm run ci`, `corepack pnpm test:integration`, `corepack pnpm test:e2e:auth`, `corepack pnpm api:check` and `corepack pnpm security:audit`. Integration tests use an isolated database named `dike_stage3_<random-id>` and scoped Redis keys. They require a real Mongo replica set and Redis. Browser tests require Docker and Chromium; traces, screenshots and video are disabled because development OTPs appear on screen.
