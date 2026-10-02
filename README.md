# Dike

Dike is a greenfield ride-sharing platform being designed for a controlled production pilot in Vietnam. The repository contains the Stage 1 application foundation: a responsive Next.js shell, modular NestJS API, BullMQ worker, generated API client and local MongoDB/Redis/MinIO infrastructure.

## Current status

- Stage: **1 — application and local infrastructure foundation**
- Production ready: **No**
- Existing legacy application/data: **None**
- Target clients: responsive Next.js web first, React Native mobile later
- Target backend: modular NestJS monolith with a separate worker process

Do not use this repository to collect real identity documents, location history, phone numbers, or production credentials before the relevant security and privacy gates in [the plan](plan/PLAN.md) are complete.

## Requirements

- Node.js 22
- Corepack
- pnpm 10 (the exact version is pinned in `package.json`)
- Docker Desktop or Docker Engine with Compose v2

## Local setup

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm dev
```

Using `corepack pnpm` avoids depending on a global pnpm shim and works when PowerShell blocks `pnpm.ps1`.

The first `pnpm dev` creates a Git-ignored `.env.local` with random local-only credentials, builds shared packages, starts MongoDB/Redis/MinIO and then runs web, API and worker. It does not delete volumes when stopped.

Local endpoints:

- Web: `http://localhost:3000`
- API live: `http://localhost:3001/api/v1/health/live`
- API ready: `http://localhost:3001/api/v1/health/ready`
- Swagger (local/test only): `http://localhost:3001/api/docs`
- MinIO console: `http://localhost:9001`

Useful commands:

```bash
corepack pnpm dev:apps
corepack pnpm infra:up
corepack pnpm infra:down
corepack pnpm infra:logs
corepack pnpm infra:reset -- --confirm
corepack pnpm db:migrate
corepack pnpm db:migrate:status
corepack pnpm db:seed
corepack pnpm api:generate
corepack pnpm api:check
corepack pnpm test:integration
corepack pnpm run ci
```

`infra:reset` is the only command that removes local Dike volumes and refuses to run without `--confirm`. Stage 1 intentionally contains no login, user, ride, booking or other product-domain endpoint.

### Troubleshooting

- **Docker unavailable:** start Docker Desktop/Engine, wait until it reports ready and rerun `pnpm dev`.
- **Port already in use:** stop the process using 3000, 3001, 27017, 6379, 9000 or 9001.
- **Ready returns 503:** run `pnpm infra:logs`; live should remain available while a dependency is down.
- **Generated client drift:** run `pnpm api:generate` and commit the resulting OpenAPI client.
- **PowerShell blocks pnpm.ps1:** keep using `corepack pnpm` as shown above.

## Important documents

- [Product and production plan](plan/PLAN.md)
- [Stage 0 implementation specification](plan/STAGE_0.md)
- [Architecture decisions](docs/architecture/README.md)
- [Security policy](SECURITY.md)
- [Contribution guide](CONTRIBUTING.md)

## Rights

Copyright © 2026 Dike contributors. All rights reserved. This public repository is available for inspection only; no license to copy, modify, distribute, sublicense, or use the code commercially is granted. See [RIGHTS.md](RIGHTS.md).
