# Greenfield baseline inventory

Recorded: 2026-10-01

## Inputs

- `plan/PLAN.md`: canonical product, architecture, and delivery plan.
- `plan/STAGE_0.md`: Stage 0 implementation specification.

No application source, package manifest, tests, runtime database, user export, or legacy Git history existed when Stage 0 began. The old prototype was deleted intentionally and will not be reconstructed or migrated.

## Tool baseline

- Node.js: 22.20.0
- npm: 11.14.1
- Corepack: 0.34.0
- Git: 2.49.1 for Windows
- Docker CLI: installed; runtime use begins in Stage 1
- GitHub CLI: installed, but authentication must be renewed before remote repository setup
- Gitleaks CLI: not installed locally; CI is configured to run the pinned Gitleaks action

## Data classification

- No real user data or identity documents are present.
- No legacy JSON data exists or will be migrated.
- Future local/test seeds must be synthetic and reproducible.
- Production secrets and provider credentials must stay outside Git.

## Generated or sensitive paths excluded from Git

Dependencies, build outputs, reports, `.env*`, certificates/private keys, runtime data, infrastructure volumes, logs, and editor-local state are excluded by `.gitignore`.

## Stage 0 boundary

Stage 0 creates repository governance and tooling only. Next.js, NestJS, the worker, databases, and domain behavior begin in Stage 1.
