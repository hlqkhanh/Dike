# Stage 0 completion report

Date: 2026-10-01

## Result

The local greenfield repository baseline is implemented. It contains repository
configuration, architecture decisions, security policy, developer tooling and CI
definitions only. Application source code, production credentials and legacy data
are intentionally absent.

The GitHub-hosted controls remain pending until the repository owner restores CLI
authentication and supplies the final three-member access list. Stage 0 must not be
declared fully complete until the controls in the pending section are verified on
GitHub.

## Baseline

- Branch: `main`.
- Initial commit subject: `chore: initialize greenfield repository`.
- Annotated baseline tag: `planning-v0.1.0`.
- The tag represents a planning/configuration baseline, not a recoverable prototype.
- The deleted prototype and demo JSON are not migration inputs.
- Runtime baseline: Node.js 22 and pnpm 10.17.1 through Corepack.

## Local controls implemented

- pnpm workspace boundaries for `apps/*` and `packages/*`.
- Exact tool versions and one frozen `pnpm-lock.yaml`.
- Dependency lifecycle scripts denied by default; no package is currently allowlisted.
- Strict shared TypeScript configuration, ESLint flat config and Prettier.
- Husky, lint-staged and Commitlint gates.
- Secretlint locally and Gitleaks in CI.
- CI jobs named `quality`, `test` and `build`, with read-only default permissions.
- CodeQL, dependency review, production dependency audit and CycloneDX SBOM workflows.
- Dependabot for npm and GitHub Actions dependencies.
- Six accepted ADRs and a dependency-aware implementation backlog.
- Security, contribution, conduct, ownership and emergency-bypass documentation.
- Public-repository templates and an all-rights-reserved notice.

## Verification evidence

- Frozen-lockfile installation completed successfully with lifecycle scripts disabled.
- A second frozen installation did not change the lockfile SHA-256:
  `DC5C3AFF6E4CA508891F6E703D5B53CBE26168ACFCAA65B7C173915BF7106BDA`.
- `corepack pnpm run ci` passed.
- `corepack pnpm security:audit` reported no known production vulnerabilities.
- `corepack pnpm sbom` generated a CycloneDX SBOM successfully; the local artifact is
  ignored and CI publishes it as an artifact.
- Repository and documentation scans found no credential, private key, connection
  string or personal user data. See `docs/security/initial-scan.md` for limitations.
- `dev`, `test` and `build` explicitly report that no application workspaces exist;
  application gates become active automatically when Stage 1 scaffolds them.
- All third-party GitHub Actions references use immutable full commit SHAs.

## Accepted ADRs

1. ADR-0001: modular monolith.
2. ADR-0002: MongoDB Atlas and Mongoose.
3. ADR-0003: authentication strategy.
4. ADR-0004: Cloudflare R2 file storage.
5. ADR-0005: deployment topology.
6. ADR-0006: repository and supply-chain security.

## Pending GitHub-hosted verification

The local GitHub CLI credential for account `hlqkhanh` is invalid. The following
operations were therefore not attempted or claimed as complete:

- Create the public GitHub repository and push `main` plus `planning-v0.1.0`.
- Invite the three named members, assign least privilege and verify 2FA.
- Ensure two recoverable administrators and no shared accounts or unexplained apps.
- Enable private vulnerability reporting, secret scanning and push protection.
- Create and test the `main-protection` ruleset, including one independent approval,
  stale-review dismissal, conversation resolution, linear history, and blocking
  direct push, force push and branch deletion.
- Require `quality`, `test`, `build`, `secret-scan`, `dependency-review`,
  `dependency-audit` and `codeql`.
- Configure squash-only merge and automatic feature-branch deletion.
- Create GitHub milestones, labels and project-board views from `docs/backlog.md`.
- Exercise fork-PR isolation and confirm CodeQL/dependency results in GitHub Security.

These are server-side controls and cannot be proven by repository files alone. After
reauthentication, follow `docs/security/ownership.md` and
`docs/operations/emergency-branch-bypass.md`, then append the GitHub URLs, reviewers
and test evidence to this report.

## Risks carried into Stage 1

- CI definitions have been validated locally but have not yet run on GitHub-hosted
  runners.
- There are no application tests or builds until the Stage 1 workspaces are created.
- Owner placeholders in `CODEOWNERS` and the ownership matrix must be replaced if the
  final GitHub team differs from the current repository owner.
- Cloud and deployment credentials must use environment separation and must never be
  committed; prefer short-lived or federated credentials when providers support them.
