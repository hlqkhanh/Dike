# Contributing

External code contributions are not accepted during the pilot because this repository does not grant an open-source license. Team members must follow this workflow.

## Setup

1. Use Node.js 22 and enable Corepack.
2. Run `corepack pnpm install --frozen-lockfile`.
3. Run `corepack pnpm run ci` before sharing or merging a change.

## Branches and commits

- Prefer a short-lived branch from `main`: `feat/...`, `fix/...`, `docs/...`, or `security/...`.
- Trusted members with `Write` access may push directly to `main` for small, low-risk changes.
- Use Conventional Commits with one of: `feat`, `fix`, `refactor`, `test`, `docs`, `build`, `ci`, `chore`, `security`.
- Do not bypass hooks routinely. If an urgent change bypasses a check, run the skipped check immediately afterward and record any remaining risk.

## Pull requests

- Pull requests are recommended for changes that benefit from discussion, affect multiple areas, or carry security/data risk; they are not mandatory for trusted members.
- Keep one logical change per pull request or direct-push commit series.
- Add or update tests for behavioral changes.
- Document security, privacy, migration, and rollback impact.
- Never include secrets, personal data, production exports, or real identity/location data.
- Ask another member to review high-risk changes. Independent approval is recommended but not enforced by repository rules.

## Repository permissions

- Team members receive `Write` access so they can create branches, push, open pull requests and merge their work.
- `Admin` access remains limited to the repository owner and, if needed, one recovery administrator because it can change security settings, access and repository lifecycle.
- Force-pushing or deleting `main` is prohibited by team policy even when GitHub does not technically block it.
- CI and security results are advisory during normal development. A member who merges or pushes a failing change owns the follow-up and must not knowingly ship a security-critical failure.

Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).
