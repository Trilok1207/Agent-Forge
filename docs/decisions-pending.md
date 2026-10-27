# Assumptions, open decisions, and blockers

The **owner** resolves these at the Session 0 gate, before M1. Sessions must not pick vendors, create accounts, add credentials, or deploy.

## Assumptions (correct me if wrong)
1. **Brand.** The product is "AgentFlow". The repo is named `Agent-Forge`, and its README describes a different idea (a site to learn agentic AI and build a portfolio). These docs assume AgentFlow is the product this repo will hold.
2. **Solo owner, small scale.** V1 targets hundreds to low thousands of users. Simple infrastructure (one Postgres, one API image) is enough.
3. **Region and compliance.** No HIPAA/PCI scope (card data stays with the billing vendor). GDPR-style basics apply: deletion, export, sub-processor disclosure.
4. **Model content leaves the device.** Users accept that extracted content goes to the cloud and the model vendor, with disclosure. No local inference in V1.
5. **Windows 10 (22H2+) and 11, x64.** ARM64 isn't a V1 target.
6. **English-only UI in V1.**
7. **Artifact retention 7 days**, audit retention 1 year (proposals).

## Owner decisions needed

| # | Decision | Options / notes | Needed by |
|---|---|---|---|
| D1 | Brand name, domain, and what happens to the current README | AgentFlow vs AgentForge; check trademark and domain availability | M1 (package names), M8 (UI) |
| D2 | Hosted model vendor(s) and default models | Anthropic, OpenAI, Google, etc. Check data-retention and no-training terms. Which vendors BYOK supports at launch. | M5 |
| D3 | Billing vendor | **Stripe** (lowest fees, most control; you handle sales tax/VAT) vs **merchant of record** like Paddle or Lemon Squeezy (they handle global tax; higher fee) | M13 (test mode by M8 is helpful) |
| D4 | Tier names, prices, quotas | e.g. Free (demo + N runs) / Pro monthly / Pro yearly; token and run limits; BYOK pricing | M13 (limits needed earlier for M3 defaults) |
| D5 | Hosting for web, API/worker, Postgres | e.g. Vercel/Netlify for web; Fly/Render/Railway/AWS/GCP for API; managed Postgres (Neon/Supabase/RDS/Cloud SQL) | M3 (dev uses Docker), deployment at M14 |
| D6 | KMS / secret store for BYOK and platform keys | Follows hosting choice (AWS KMS, GCP KMS, etc.) | M6 |
| ~~D7~~ | ~~Auth library~~ | **Decided in Session 2:** `arctic` + first-party sessions (ADR-014). Reversible if the owner prefers a managed IdP. | — |
| D8 | Job queue library | pg-boss vs Graphile Worker (ADR-005). Not needed yet: Session 3 executes the mock workflow in-request (ADR-018). | M5/M7 (with real model calls) |
| D9 | Error/observability vendor | Sentry or similar, configured to drop content | M14 |

## Blockers (owner action required, cannot be done by a session)
- **OAuth app registrations:** Google Cloud project + OAuth consent screen (identity scopes only, so no restricted-scope verification needed), GitHub OAuth App. Sign-in code is ready (Session 2); follow [auth-setup.md](auth-setup.md). Until then sign-in stays disabled.
- **Code-signing certificate** for Windows (OV/EV Authenticode, or Azure Trusted Signing). Without it, SmartScreen warnings block a credible beta. Needed by M14.
- **Tauri updater signing key** generated and stored offline by the owner. Needed by M14.
- **Legal text:** Privacy Policy, Terms of Service, sub-processor list, refund policy (billing vendors require these). Needed before closed beta.
- **Vendor accounts and keys** for D2, D3, D5, D6, created by the owner and placed in secret stores.
- **Windows CI runner availability** (GitHub-hosted Windows runners count more against Actions minutes on private repos). Needed by M9.

## Sign-off
- [ ] Scope and non-goals approved
- [ ] ADR-001…013 approved or amended
- [ ] Threat model boundaries B1–B12 approved
- [ ] D1–D6 decided (D7–D9 can be decided in their milestones)

Owner: ____________ Date: ____________
