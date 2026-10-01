# Delivery backlog map

The canonical feature details and acceptance rules remain in [plan/PLAN.md](../plan/PLAN.md). Each implementation issue must include objective, dependency, security/privacy impact, tests, acceptance criteria, and out-of-scope notes.

## Milestones

| Milestone | Outcome                                            | Depends on                |
| --------- | -------------------------------------------------- | ------------------------- |
| Stage 0   | Repository, governance, CI, security baseline      | None                      |
| Stage 1   | Greenfield web/API/worker and local infrastructure | Stage 0                   |
| Stage 2   | Google authentication and sessions                 | Stage 1                   |
| Stage 3   | Phone OTP and roles                                | Stage 2                   |
| Stage 4   | Profiles, privacy, and R2                          | Stage 3                   |
| Stage 5   | eKYC sandbox, vehicles, communities                | Stage 4                   |
| Stage 6   | Friendships, blocks, authorization policies        | Stage 3                   |
| Stage 7   | Schedules and travel intents                       | Stages 5–6                |
| Stage 8   | Goong routing and contribution quotes              | Stage 1                   |
| Stage 9   | Ride posts and feed                                | Stages 6–8                |
| Stage 10  | Trips and atomic seat management                   | Stages 5, 8               |
| Stage 11  | Proposals and bookings                             | Stages 9–10               |
| Stage 12  | Chat, notifications, realtime                      | Stages 6, 11              |
| Stage 13  | Instant availability and live journey              | Stages 8, 11–12           |
| Stage 14  | Contributions, reviews, moderation                 | Stages 11–12              |
| Stage 15  | Production web completion and accessibility        | Stages 2–14               |
| Stage 16  | React Native mobile                                | Stable API after Stage 15 |
| Stage 17  | Production hardening and controlled pilot          | All required pilot stages |

## Labels

- Type: `type:feature`, `type:bug`, `type:security`, `type:tech-debt`
- Area: `area:web`, `area:api`, `area:worker`, `area:mobile`, `area:infra`
- Priority: `priority:p0`, `priority:p1`, `priority:p2`, `priority:p3`
- State supplement: `status:blocked`

## Project columns

`Backlog → Ready → In Progress → Review → Done`, with a separate `Blocked` state.

## Explicitly outside the first pilot

- In-app payments, wallet, collection, refunds, and reconciliation
- Group chat and voice/video calls
- Large-scale dispatching, microservices, and Kubernetes
- Web background GPS guarantees
- Real eKYC data before legal/privacy approval
- Public comments, OCR schedule import, booking for others, and unaccompanied minors
