# Stage 5 backend — local sandbox

Backend covers verification applications, signed mock eKYC callbacks, reviewer decisions, vehicle approval, communities/membership, evidence access and audit. Frontend Stage 5 is not included. All workflow endpoints are disabled outside local/test or when `EKYC_PROVIDER=disabled`.

## Setup

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm dev
# In another terminal, after migrations finish:
corepack pnpm db:seed:stage5
```

`dev` appends missing local settings without replacing existing values. It generates an independent `EKYC_WEBHOOK_SECRET`, sets `EKYC_PROVIDER=mock` and loopback `EKYC_CALLBACK_URL`. Explicitly disabled settings are preserved. Mongo requires replica set transactions; Redis and MinIO must be running. Seed is optional, explicit and idempotent: it creates Sandbox Admin One, Sandbox Admin Two, Sandbox Member, a community and draft motorcycle. Accounts use mock OIDC and synthetic OTP status; no SMS or real phone is involved. Re-running seed does not re-grant revoked roles or reactivate deleted accounts.

Swagger: `http://localhost:3001/api/docs`. API routes are under `/api/v1`. Swagger documents contracts but is not an authentication bypass: member/admin endpoints require the existing signed BFF boundary, opaque session and CSRF on mutations. Frontend implementation must add fixed Next BFF routes using the generated client. Integration tests include a signed HTTP helper for backend acceptance.

## Commands and states

Every create/mutation accepts `commandId` (UUID); versioned mutations also take `expectedVersion`. Reuse the same command ID/body after a transport failure. Same ID with a different operation/body returns `IDEMPOTENCY_CONFLICT`; stale versions return `VERSION_CONFLICT`. IDs are scoped to actor and retained for 30 days. This implementation uses a body command ID instead of the originally proposed Idempotency-Key header.

1. Member accepts the current Stage 4 consent and has verified phone status.
2. POST `/verification/applications` creates DRAFT; upload synthetic images through Stage 4 files using IDENTITY_SANDBOX (legacy VERIFICATION_SANDBOX is also accepted).
3. POST `/verification/applications/:id/submit` with file IDs moves to PROVIDER_PENDING.
4. Admin POST `/admin/sandbox/verification/:id/run` chooses PASS/FAIL/PENDING/EXPIRED/TIMEOUT. PASS/FAIL/EXPIRED enqueue a signed HTTP callback; PENDING leaves the application waiting; TIMEOUT makes it due for the worker expiry sweep.
5. Callback is HMAC-SHA256 over timestamp, dot, raw JSON; headers are `x-ekyc-key-id: local-v1`, `x-ekyc-timestamp` (milliseconds), `x-ekyc-signature` (hex). Five-minute window, 8 KiB validated payload, durable inbox and unique event ID. Worker callbacks carry application/attempt/provider binding, never document bytes or URLs.
6. PASS moves to REVIEW_PENDING. Admin POST `/admin/verifications/:id/decision` with APPROVE/REJECT/REVOKE and a reason. Self-review is rejected. Only approve gives identity VERIFIED. DRAFT/provider sessions expire after one day, review after seven days.
7. Vehicles: create/edit draft, submit new VEHICLE_DOCUMENT_SANDBOX evidence, admin approve; edit/withdraw/archive/revoke updates effective driver rights. Synthetic plates require `SYNTH-` prefix. Motorcycle capacity is one passenger; cars allow one to eight, excluding driver.
8. Communities: admin create/edit/archive; OTP member join/cancel/leave; admin approve/reject/revoke. Rejected/left/revoked memberships have a seven-day reapply cooldown. Archived communities immediately fail membership access policy.

`/admin/sandbox/verification/:id/retry` enqueues a new delivery using a new command ID while PROVIDER_PENDING. It does not reopen expired or decided applications. BullMQ transport retries use exponential backoff; after exhaustion the application remains pending until retry or expiry. Unknown job types fail permanently rather than entering the foundation sample handler.

## Authorization and evidence

VERIFIED_MEMBER now means ACTIVE + verified phone + approved sandbox identity. APPROVED_DRIVER additionally requires a current approved vehicle projection. All business changes update the projection transactionally; old role strings cannot grant either capability. ADMIN/MODERATOR remain based on administrative grant plus phone verification, avoiding a bootstrap cycle. Migration 005 removes legacy business role strings without treating OTP as identity approval. Phone change suspends effective privileges immediately.

File attachment and submit happen transactionally. Pending evidence is locked against deletion; cancel/withdraw/decision releases the deletion lock but does not make old evidence reusable. Reviewer access checks ADMIN, active owner, resource state and exact file linkage before returning a 60-second signed URL; audit commits before returning it. Profiles expose only approved vehicle type/model/color/capacity, with existing profile privacy checks. No plate, evidence or membership roster is public.

Evidence is retained up to 30 days from submit; pending workflows expire before/with evidence. Account deletion removes new workflow records/inbox/outbox/commands and unlinks reviewer identifiers. A callback or queued delivery cannot grant rights to an inactive account. Public avatar handling remains unchanged.

## Validation and limits

Run `corepack pnpm run ci`, `corepack pnpm test:integration`, and `corepack pnpm security:audit`. Stage 5 integration covers signed HTTP/CSRF, duplicate callback, concurrent review, self-review, evidence locks, driver revocation, community archive and late callbacks. Worker unit tests cover signed HTTP transport and retry behavior.

At implementation time Docker Engine on this Windows host is unavailable (missing `dockerDesktopLinuxEngine` pipe). Integration/runtime acceptance therefore remains pending; authored tests are not reported as runtime passes. No production provider, production deployment or Stage 5 frontend is included.

Local scope tradeoff: a global authorization revision serializes workflow mutations, matching the existing role administration convention. Before scaling beyond local, replace this with measured aggregate-level locking while preserving race tests. The shared `@dike/workflows` package owns transactions for both API and worker; controllers remain separated by domain.

Validation checkpoint: full local CI passed with 72 unit tests, formatting, lint, typecheck, build, generated-client check and secret scan. Dependency audit reported no known vulnerabilities. Attempted Stage 5 integration failed during setup with ECONNREFUSED at 127.0.0.1:27017; all three integration cases remained unexecuted.
