# Repository recovery and unsafe Git operations

The repository intentionally does not enforce a `main` branch ruleset for the trusted three-person team. This flexibility is not permission to rewrite shared history casually.

- Use `Write` access for ordinary development; reserve `Admin` for repository ownership and recovery.
- Never force-push or delete `main` during normal work.
- Before an exceptional history repair, notify the other members and create a recoverable tag or branch.
- Record why the operation is necessary and identify the exact refs affected.
- Prefer reverting a bad commit over rewriting published history.
- After recovery, run `corepack pnpm run ci`, verify remote refs and document any skipped security checks.
- Rotate credentials immediately if the incident involved a committed secret; rewriting Git history alone does not revoke it.
