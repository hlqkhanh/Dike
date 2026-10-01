# Emergency branch-protection bypass

Normal work must never bypass the `main` ruleset. An emergency bypass is allowed only to address an active security incident or a repository-wide CI outage that blocks an urgent security fix.

1. Two administrators agree on the reason and record an incident issue without sensitive exploit details.
2. Apply the narrowest temporary ruleset exception.
3. Merge the reviewed fix; do not force-push or rewrite unrelated history.
4. Restore the normal rules immediately.
5. Run all skipped checks and document results within one business day.
6. Review why normal controls failed and add a prevention task.
