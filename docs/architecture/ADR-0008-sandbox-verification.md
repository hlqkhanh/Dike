# ADR 0008 — Separate phone, identity and driver authorization

Status: accepted for local Stage 5 backend.

Stage 3 derived VERIFIED_MEMBER from OTP alone. Stage 5 introduces sandbox identity review: phone verification alone grants MEMBER; approved identity plus verified phone grants VERIFIED_MEMBER; at least one approved vehicle additionally grants APPROVED_DRIVER. Stored legacy role strings are ignored for these two capabilities. Admin and moderator grants continue to require verified phone but do not require identity approval.

A provider PASS is evidence for review, never final approval. Decisions recheck actor, owner, resource version and dependencies within Mongo transactions, update user authorization projections, and append audit. Sessions read current user state so no fresh login is needed after decisions. The business-specific trip policy also verifies vehicle ownership and approval.

Mock is available only in local/test, with synthetic data and independently signed HTTP callbacks. Stage 5 endpoints fail closed in hosted environments. Production semantics and provider integration require a later decision; sandbox identity must never be presented as real verification.

Mutation idempotency is implemented as a body commandId UUID plus expectedVersion, rather than the proposed header. Frontend retries must preserve commandId and body. Shared transactions live in @dike/workflows for API/worker consistency.
