# Stage 4 — Profiles, privacy and object storage

## Scope and contracts

Implement the Stage 4 master-plan scope on the Stage 3 authentication foundation. No new social, booking, driver or eKYC approval behavior is included. Private verification uploads accept synthetic images in local/test only; hosted collection remains disabled.

- `GET/PUT /me/profile`: display name (2–80 characters), bio (0–300), avatar and phone verification indicator. OAuth re-login must not overwrite a user-edited profile.
- `GET/PUT /me/privacy`: profile visibility `MEMBERS|PRIVATE`, discoverability (default false), future direct-message policy `NONE|FRIENDS|MEMBERS` (default NONE). Schedules, precise location and contact data never appear in profile projections.
- `GET /users?query=`: bounded literal name search, authenticated viewers only, opt-in discoverability, no phone/email search. `GET /users/:id`: current privacy checked on every read. No shared cache.
- `GET/PUT /me/consents`: current versioned terms/privacy acknowledgement and optional analytics consent, append-only history in a Mongo transaction. The local policy text is a development draft, not approved pilot legal copy.
- `POST /me/deletion`: explicit `DELETE` confirmation, session authentication and CSRF. Deactivate and revoke all sessions immediately; last-admin invariant preserved. Purge profile/identity/session/consent data after 7 days. Keep a minimal deleted tombstone until 90-day security retention expires. New login after full deletion creates a new account, never reactivates the old one.
- `POST /files/uploads`, `POST /files/:id/complete`, `GET /files/:id/download`, `DELETE /files/:id`: opaque file ID, server-generated random object keys, ownership checked each time. Private access is owner-only in this stage; administrative review comes with Stage 5 authorization/audit.

All mutations require signed BFF requests, current opaque session, CSRF, and strict DTO validation. User-supplied role, owner, key, bucket and avatar URL fields are rejected. Controllers expose deterministic OpenAPI; web uses the generated client.

## File lifecycle

Presigned PUT valid for 5 minutes binds content type and exact declared length (maximum 5 MiB). JPEG/PNG/WebP only. All incoming bytes land in the private bucket under `uploads/`; final objects use separate random keys. Completion checks ownership, expiry, actual length/type and decodes with a 16-megapixel limit. Re-encoding strips metadata and extraneous payloads. Avatars become bounded JPEGs in the public bucket; sanitized sandbox images stay private. No SVG/PDF/executable uploads.

An expiring Mongo claim serializes completion. A transaction rechecks account status and claims before attaching an avatar. Server-only final keys prevent replay of the upload URL from changing accepted content. Orphan candidates retain their target key in metadata so a crash after upload is recoverable by cleanup. Quarantine deletion waits beyond URL expiry; a bucket lifecycle rule expires `uploads/` after one day as defense in depth.

Worker sweeps every minute: incomplete uploads expire after 15 minutes; processing claims expire after two minutes; detached avatars and deleted files are removed after a short grace period; sandbox private images expire after 30 days. Delete retries are idempotent. No TTL deletes metadata before object deletion succeeds. Private signed GET lasts 60 seconds and is not cached; possession grants access until expiry. Public avatar URLs may be cached or copied and are explicitly described as public in the UI.

## Runtime and production gates

Local MinIO and hosted R2 use one S3 adapter with separate buckets. Hosted settings require HTTPS endpoint/public avatar URL and explicit retention approval before cleanup is enabled. This approval is an operational configuration gate, not an assertion of legal compliance. Configure exact-origin CORS and private bucket denial; configure a dedicated public avatar origin without directory listing. Never set public access on the private bucket.

## Acceptance

Unit tests cover projection/privacy rules, consent validation, MIME/size/image decoding, signed URL restrictions and worker cleanup. Mongo/Redis/MinIO integration tests cover migrations, file ownership, private denial, replay-safe completion, profile persistence and deletion. Browser tests cover editing, privacy and avatar upload with synthetic data. Run full CI, integration, E2E, deterministic API check and dependency/secret scans. Record unavailable external services honestly; do not mark runtime acceptance complete without running it.

## Local implementation checkpoint

Implemented profile/privacy/consent pages, authenticated name search, upload completion and account deletion with worker retention. Formatting, lint, typecheck, unit tests, build, generated API consistency, dependency audit and secret scan passed locally. Integration and browser tests are authored but runtime acceptance is pending: Docker Engine is unavailable on this host. No production deployment is part of this iteration. See [local runbook](../docs/operations/profiles-files.md).
