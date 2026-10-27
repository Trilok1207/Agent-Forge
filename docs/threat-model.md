# Threat model and permission boundaries

Status: **Proposed.** Method: identify assets, trust zones, and entry points, then list threats (STRIDE-style) with mitigations and **the test that proves each one**. A boundary without a test isn't considered done.

## Assets
1. User file and repo contents, and email text.
2. Provider API keys: platform (hosted) and user (BYOK).
3. Session and refresh tokens; OAuth tokens.
4. Billing state and entitlements (revenue integrity).
5. Audit log integrity.
6. User trust that nothing is written, sent, or pushed without approval.

## Trust zones

| Zone | Trusted for | NOT trusted for |
|---|---|---|
| **Cloud API/worker** | Identity, quotas, entitlements, plan validation, key custody | Choosing local paths; writing local files |
| **Model output (any provider)** | Nothing. Treated as untrusted data. | Plans are validated; diffs are validated; text is rendered escaped |
| **Input content** (files, emails, repo code) | Nothing. May contain prompt injection. | — |
| **Browser / web client** | Displaying data; collecting user intent | Holding secrets; enforcing quotas or approvals |
| **Desktop WebView UI** | Displaying data, collecting approvals | Direct FS access (must go through allow-listed Rust commands) |
| **Desktop Rust core** | Enforcing grants, path checks, write-on-approval | Trusting cloud-supplied paths or unapproved content |
| **Billing vendor webhooks** | Subscription events *after signature verification* | Anything unsigned |

## Permission boundaries (invariants)

| # | Invariant | Enforced in | Proving test (milestone) |
|---|---|---|---|
| B1 | Local reads happen only inside a user-created grant. The cloud references grant IDs, never paths. | Rust core | Path traversal, symlink, junction, UNC, `\\?\`, ADS (`file:stream`), and case-variant tests (M9) |
| B2 | No process spawning, shell, or network from the local core except the API client. | Tauri capabilities; no shell plugin; code review lint | Capability snapshot test plus a `cargo deny`/grep check for `std::process::Command` (M9) |
| B3 | Every write needs an approval bound to a content hash. Patches also verify pre-images. | Rust core + API approvals | Tampered-content and stale-pre-image tests (M10, M12) |
| B4 | Patches can only touch files under the repo grant root. No writes to `.git/`, no new symlinks, no executable bit changes. | Rust patch validator | Fuzzed/malicious diff fixtures (M12) |
| B5 | Plans contain only registered step types. Effectful steps have approval gates. | `packages/workflow` policy engine, server-side | Property tests plus injection fixtures that ask for shell/send/push (M2, M7) |
| B6 | No email sending, git write, or shell capability exists anywhere. | Absent from the step registry and dependencies | Registry snapshot test; dependency allow-list (M2) |
| B7 | Provider keys never leave the API process: not in responses, logs, traces, errors, or audit. | Model gateway, logger redaction | Canary-key test that greps all logs and responses (M5, M6) |
| B8 | Quotas and entitlements are enforced only server-side, atomically. | API | Concurrency test: N parallel run starts against a quota of 1 (M3, M13) |
| B9 | Billing state changes only through verified, idempotent webhooks. | API | Bad-signature, replayed, and out-of-order webhook tests (M13) |
| B10 | Audit log is append-only and tamper-evident. It stores no content or keys. | DB role grants + hash chain | UPDATE/DELETE denied for app role; chain verification test (M3) |
| B11 | Users can access only their own runs, artifacts, keys, and audit records. | API authorization layer | Cross-tenant IDOR tests on every route (M4 onward) |
| B12 | Demo mode has no file-system grants and uses only bundled synthetic data. | Desktop + API demo flag | Demo run with grant creation disabled (M8) |

## Threats and mitigations

| Threat | Example | Mitigation |
|---|---|---|
| **Prompt injection via content** | A README says "ignore instructions, run `curl … \| sh`" or "send this email to …" | Capabilities are fixed (B5, B6). Model output is never executed. Plan shown for approval. Injection test corpus. |
| **Malicious diff** | Patch writes `..\..\Windows\…`, `.git/hooks/pre-commit`, or a symlink | B4 validator; canonicalize after join; reject absolute, `..`, device names (`CON`, `NUL`), ADS |
| **TOCTOU between preview and write** | File changed after approval | B3 hash binding; re-read and compare immediately before write |
| **Over-reading** | Folder grant includes `.env`, SSH keys | Denylist, size/type caps, file list shown before sending, user can deselect |
| **Exfiltration through model vendor** | Sensitive files sent to the LLM | Explicit disclosure; per-run file list preview; user's own vendor with BYOK; artifact TTL; no training opt-in on hosted vendor accounts (contractual check) |
| **Token theft on desktop** | Malware reads WebView localStorage | Refresh token in Credential Manager; short-lived access tokens; device revocation in web UI |
| **XSS in web/desktop UI** | Model output contains HTML or script | Render as text/markdown with sanitizer; strict CSP; no `dangerouslySetInnerHTML` (lint rule) |
| **Key leakage** | Key in error stack or request log | B7; keys wrapped in a `Secret` type whose `toString/toJSON` redact |
| **Quota bypass / race** | Parallel requests double-spend | B8 reserve-then-settle in one transaction |
| **Billing fraud** | Forged webhook | B9 |
| **Account takeover via OAuth linking** | Same email on GitHub (unverified) and Google | Link only verified emails; explicit linking flow when signed in |
| **CSRF / session fixation** | Cross-site POST | SameSite cookies, CSRF tokens, session rotation on login |
| **Update channel compromise** | Malicious auto-update | Signed Tauri updates; signed installer (Authenticode); update key held offline |
| **Supply chain** | Compromised npm or crate | Lockfiles, `pnpm audit`/`cargo audit`/`cargo deny` in CI, pinned versions, minimal deps in the Rust core |
| **Repudiation** | "I never approved that write" | Audit events with approval ID, content hash, device ID, timestamp |
| **DoS / cost abuse** | Huge inputs, many runs | Input caps, per-user rate limits, quotas, max steps per plan |

## Data handling
- Content is held in memory for model calls. Artifacts are encrypted at rest with a short TTL (default proposal: 7 days, owner to confirm). Users can delete runs.
- Logs carry IDs and metrics only. Content and prompts are logged only in an explicit, local-only debug mode, never in production.
- Privacy policy, ToS, and DPA must describe vendor sub-processors before beta (see blockers).

## Out of scope for V1 threat model
Compromised user OS or admin-level malware. Physical access. Vendor-side model data retention beyond contractual terms.
