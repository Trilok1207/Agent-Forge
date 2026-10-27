# Product scope (V1)

Status: **Proposed — awaiting owner review (Session 0 gate).**
Working name: **AgentFlow** (see [decisions-pending.md](decisions-pending.md) for the brand decision).

## One-line pitch

Describe a task in plain language; AgentFlow plans it as a reviewable workflow, runs model steps in the cloud, touches only the local files you explicitly picked, and never writes, sends, or pushes anything without your approval.

## Surfaces

| Surface | Role in V1 |
|---|---|
| **Windows desktop app (Tauri)** | Primary product. Picks local files/repos, extracts content, shows plans, previews, diffs, and approvals; performs approved local writes. |
| **Responsive website (Next.js)** | Marketing, sign-in, billing, account and BYOK key management, run history, audit log viewer, and the **web demo**. It also runs the email workflow on pasted text (needs no local access). |
| **Cloud services** | Accounts, billing/entitlements, workflow planning and run state, model calls, quotas, audit records. |

## V1 workflows

All three are expressed in the same general workflow model ([architecture.md](architecture.md#workflow-model)). They are *templates the planner may choose*, not hard-coded apps.

### 1. Documents — summarize / extract
- Input: files the user picks one by one (or a folder they pick, filtered to supported types). Supported: `.txt`, `.md`, `.csv`, `.pdf` (text layer only), `.docx`.
- Output: a summary or structured extraction (fields/table) generated from a natural-language instruction.
- **Preview before saving.** Results appear in-app; saving to disk is a separate, approved write to a location the user picks in a save dialog.

### 2. Email — summarize / classify / draft replies
- Input: messages the user *provides*: pasted text or selected `.eml` files. No mailbox connection in V1.
- Output: per-message summary, a category from user-defined or default labels, and a draft reply.
- **Never sends.** Drafts can be copied to the clipboard or saved as a `.eml`/`.txt` file (approved write). No SMTP, Gmail, or Graph send scopes exist anywhere in the system.

### 3. Repositories — analyze and propose a diff
- Input: one local repository folder the user picks.
- Output: an analysis report and **proposed edits as a unified diff**, reviewed file by file in-app.
- On approval, the user can **export a `.patch` file** or **apply the patch to the working tree**. Both are local writes and both need approval.
- **No** arbitrary shell commands, builds, test runs, package installs, `git commit`, `git push`, branch changes, or network calls from the repo context.

## Cross-cutting V1 features
- **Sign-in:** Google and GitHub OAuth. GitHub sign-in asks for identity scopes only. It never grants repository access, because repos are read locally.
- **Safe demo project:** bundled synthetic documents, emails, and a small sample repo. It runs with no file-system grants and no real data, and works on the web and in the desktop app. Demo runs use a small demo quota.
- **Plans:** Free (demo plus a small quota), and a paid tier billed **monthly or yearly**. Tier names, prices, and limits are owner decisions.
- **Server-enforced quotas:** runs per month, model tokens per month (hosted mode), and max input size per run. Clients only display them.
- **Audit log:** an append-only record of sign-ins, plan approvals, local-access grants, writes, model usage, billing changes, and key changes. Users can view their own log.
- **Model modes:** *Hosted* (platform keys, metered) and *BYOK* (the user's own provider key, stored encrypted server-side, never returned to any client).
- **Approvals:** explicit approval of (a) the plan before execution and (b) every write or external side effect at the moment it happens.
- **Natural-language first:** requests are typed as text. The **visual workflow builder comes after V1** and will edit the same workflow definition.

## Non-goals for V1
- Sending email, connecting mailboxes (Gmail/Outlook APIs), or any outbound message.
- Executing shell commands, scripts, builds, or tests. Running git write operations (commit, push, branch, stash, reset).
- Remote GitHub repo access via API, or creating PRs.
- Background or scheduled workflows, triggers, or autonomous agents running without the user present.
- Arbitrary tool or plugin execution, MCP servers, and third-party integrations.
- Whole-disk indexing, file watching, or reading anything not explicitly selected.
- macOS/Linux desktop builds (the architecture keeps them possible; they won't ship in V1).
- Mobile apps; team/org workspaces, shared billing, SSO/SAML.
- OCR of scanned PDFs, images, audio.
- Local or on-device model inference. Desktop-held BYOK keys.
- Visual workflow builder (post-V1; the data model is ready for it).
- Workflow marketplace or sharing.

## Success criteria for V1
1. A new user signs in, runs the demo end to end, and sees an approval prompt before any write.
2. Each of the three workflows completes on real user data on Windows 10/11.
3. A security review confirms each boundary in [threat-model.md](threat-model.md) with an automated test.
4. A paid subscription changes server-side quota within one webhook cycle. Quota exhaustion blocks new runs server-side.
