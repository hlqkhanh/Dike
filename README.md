# Dike

Dike is a greenfield ride-sharing platform being designed for a controlled production pilot in Vietnam. The repository currently contains the product plan, architecture decisions, repository controls, and development tooling. Application code starts in Stage 1.

## Current status

- Stage: **0 — repository and supply-chain baseline**
- Production ready: **No**
- Existing legacy application/data: **None**
- Target clients: responsive Next.js web first, React Native mobile later
- Target backend: modular NestJS monolith with a separate worker process

Do not use this repository to collect real identity documents, location history, phone numbers, or production credentials before the relevant security and privacy gates in [the plan](plan/PLAN.md) are complete.

## Requirements

- Node.js 22
- Corepack
- pnpm 10 (the exact version is pinned in `package.json`)

## Local setup

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm run ci
```

Using `corepack pnpm` avoids depending on a global pnpm shim and works when PowerShell blocks `pnpm.ps1`.

Stage 0 intentionally has no runnable API or web application. `pnpm dev`, `pnpm test`, `pnpm typecheck`, and `pnpm build` report that no application workspace exists until Stage 1.

## Important documents

- [Product and production plan](plan/PLAN.md)
- [Stage 0 implementation specification](plan/STAGE_0.md)
- [Architecture decisions](docs/architecture/README.md)
- [Security policy](SECURITY.md)
- [Contribution guide](CONTRIBUTING.md)

## Rights

Copyright © 2026 Dike contributors. All rights reserved. This public repository is available for inspection only; no license to copy, modify, distribute, sublicense, or use the code commercially is granted. See [RIGHTS.md](RIGHTS.md).
