# Contributing

External code contributions are not accepted during the pilot because this repository does not grant an open-source license. Team members must follow this workflow.

## Setup

1. Use Node.js 22 and enable Corepack.
2. Run `corepack pnpm install --frozen-lockfile`.
3. Run `corepack pnpm run ci` before opening a pull request.

## Branches and commits

- Create a short-lived branch from `main`: `feat/...`, `fix/...`, `docs/...`, or `security/...`.
- Never push directly to `main`.
- Use Conventional Commits with one of: `feat`, `fix`, `refactor`, `test`, `docs`, `build`, `ci`, `chore`, `security`.
- Do not bypass hooks to merge code; CI repeats the authoritative checks.

## Pull requests

- Keep one logical change per pull request.
- Add or update tests for behavioral changes.
- Document security, privacy, migration, and rollback impact.
- Never include secrets, personal data, production exports, or real identity/location data.
- Obtain one approval from someone other than the author and resolve every review conversation.

Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).
