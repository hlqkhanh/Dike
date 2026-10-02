# Infrastructure

Local infrastructure is defined in `docker/compose.yml` under the fixed Compose project `dike-local`:

- MongoDB single-node replica set for real transaction semantics.
- Password-protected Redis with local persistence.
- MinIO with separate public-avatar and private-verification buckets.

All published ports bind to `127.0.0.1`. Credentials are generated into the Git-ignored root `.env.local` and are never printed by the generator.

The local-only MinIO container uses the last pinned Debian-based Bitnami image available from the public legacy registry because the archived upstream registry is not reliably pullable. It is not a production deployment image; hosted environments use Cloudflare R2 as established by ADR-0004.

Use root commands `infra:up`, `infra:down`, `infra:logs` and `infra:reset -- --confirm`. Reset resolves the repository-owned Compose file explicitly and cannot target another project through user input.
