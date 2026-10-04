# Stage 4 local runbook

Stage 4 is implemented for local development. Production deployment is outside this iteration. Use synthetic images and mock accounts.

## Start and verify

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm dev
```

Docker Engine must be running. Startup builds shared packages, starts MongoDB replica set, Redis and MinIO, configures quarantine expiry, runs migrations, then starts web/API/worker/mock OIDC. Existing local volumes are preserved. MinIO CORS uses `MINIO_API_CORS_ALLOW_ORIGIN` from `WEB_BASE_URL`; changing it requires recreating the MinIO container with `infra:up`.

Open `http://localhost:3000/settings/profile` after mock login. Edit name/bio, select privacy, accept the draft policies, upload a synthetic JPEG/PNG/WebP, and reload. Avatars are public; verification sandbox images are private. The browser uploads directly to MinIO; ensure `S3_ENDPOINT` is reachable from the browser and `S3_PUBLIC_BASE_URL` includes the public bucket path. Local values are generated automatically.

```sh
corepack pnpm run ci
corepack pnpm test:integration
corepack pnpm test:e2e:auth
```

The browser suite includes Stage 4 profile/privacy/avatar coverage. Integration uses a unique disposable Stage 4 database and cleans up only its own objects. Never run it against hosted infrastructure. `storage:local` reapplies the local quarantine lifecycle independently.

## Retention

Worker runs a non-overlapping sweep every minute. Pending uploads expire after 15 minutes, processing claims after two minutes. Delete requests use a 15-minute grace period and wait for upload URLs to expire; failures preserve metadata for retry. Private sandbox images expire after 30 days; attached avatars have a ten-year maximum and are removed earlier on replacement or deletion. MinIO lifecycle also expires staging `uploads/` objects after one day.

Account deletion locks the account and revokes sessions immediately. After seven days, worker removes profile, identities, sessions, consents and phone verification records, then deletes owned files. Minimal security tombstones are removed after another 90 days once file deletion succeeds. These are development defaults. Local cleanup is enabled without `RETENTION_POLICY_APPROVED`; hosted collection of verification documents remains disabled.

Private URLs last 60 seconds. Anonymous requests to the same object path without its signature must return 403. File completion decodes actual bytes, strips metadata and copies to a distinct server-only key, so reusing an upload URL cannot overwrite accepted content. Existing signed links cannot be revoked instantly; public avatar copies cannot be recalled.

## Acceptance status

Docker Engine is unavailable on the current Windows host (`dockerDesktopLinuxEngine` pipe missing). Runtime integration and browser acceptance remain pending until Docker is available. Do not describe skipped tests as passes.
