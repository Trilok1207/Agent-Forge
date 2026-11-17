# Models and planning (Session 4)

This covers:
- how AgentFlow talks to language models;
- how keys are kept safe;
- how a natural-language request becomes a plan that a person reviews.

**No real provider is enabled.** The owner hasn't chosen a vendor (decision D2) or a key-management service (D6). The only provider is a deterministic, in-process **mock**. Any other `MODEL_PROVIDER` value refuses to start.

Code:
- `packages/models`: interface, gateway, mock, redaction, vault.
- `packages/workflow/src/planner.ts`: prompt, parser, and policy.
- `apps/api/src/models`: wiring, credentials, and plan service.
- `apps/api/src/routes/models.ts`: HTTP routes.

## Provider-neutral interface

```ts
interface ModelProvider {
  id: string;
  supportsHosted: boolean;      // platform key
  supportsByok: boolean;        // user's own key
  requiresCredential: boolean;  // false only for the in-process mock
  generate(req: ModelRequest, ctx: { signal: AbortSignal; credential: Secret | null }): Promise<ModelResponse>;
}
interface ModelRequest { purpose; system; messages: {role, content}[]; maxOutputTokens; responseFormat }
```

- **No tools.** `ModelRequest` has no tool or function-calling field, so a model can only return text, which we treat as data. Adding tool use would need an ADR and a threat-model row.
- **Untrusted text stays out of `system`.** The system prompt is a constant. User text and content go in `messages`, inside delimiters.
- **Adding a real provider** means:
  1. the owner decides D2;
  2. an adapter implementing `ModelProvider`;
  3. adapter contract tests against the same gateway tests;
  4. a smoke test behind a manual flag;
  5. allowing its id in `loadConfig`.

## Gateway: the only path to a model

`createModelGateway` checks, in order:

| Check | Behaviour |
|---|---|
| Provider/mode allowed | Unknown provider, BYOK on a non-BYOK provider, or a missing key: `not_configured`. Fails closed, and no call is made. |
| Input limit | More than 24,000 characters across system + messages: `input_too_large`. Checked before any reservation or call. |
| Output cap | `maxOutputTokens` is clamped to the limit (planner: 1,200). Responses over 16,000 characters: `output_too_large`. |
| Cost/quota hook | **Hosted** mode reserves `estimated input + max output` tokens through `TokenBudget`. A denial returns `quota_exceeded` before the provider is called. Success settles to actual usage; failure releases the reservation. **BYOK** is metered in logs and audit but not budgeted (ADR-010). Nothing is charged. |
| Timeout | Per attempt (`MODEL_TIMEOUT_MS`, default 20 s). The gateway races the call against its own timer, so a provider that ignores the abort signal still times out. |
| Retries | Bounded (`MODEL_MAX_ATTEMPTS`, default 3) and only for `timeout`, `rate_limited`, and `unavailable`, with exponential backoff and jitter. `auth`, `bad_request`, and invalid output are never retried. |
| Errors | Every failure becomes a `ModelError` with a **fixed** message per kind. Provider error text is redacted, trimmed to 160 characters, and only logged. It never reaches responses, storage, or audit. |
| Logging | `model.call` and `model.attempt_failed` events carry provider, mode, purpose, attempts, kind, and token counts. They **never** carry prompts, outputs, or keys. |

## Keys

| Mode | Where the key lives | Notes |
|---|---|---|
| Hosted | The API's environment or secret store, wrapped in `Secret` | No hosted keys exist yet (no approved vendor). |
| BYOK | `model_credentials`, envelope-encrypted | Write-only API: `PUT …/models/keys/{provider}` takes the key, and only `last4` is ever returned. |
| Desktop (OS credential store) | Post-V1 option | ADR-010. The desktop app stores only its own session refresh token in Windows Credential Manager (M9). |

**Envelope encryption** (`createKeyVault`, ADR-023):
- Each key gets a random 256-bit data key and is sealed with AES-256-GCM. The data key is wrapped by the KEK.
- The AAD is `workspaceId:provider`, so a row copied to another workspace fails to decrypt (tested).
- The KEK is `BYOK_KEK`: base64, 32 bytes, owner-supplied, held in the secret store. Without it, BYOK is disabled (`503 byok_not_configured` or `model_not_configured`).
- When D6 picks a KMS, the KEK moves behind the same `KeyVault` interface.
- Decrypted keys exist only as a `Secret` in memory for a single call.

**Redaction:**
- `Secret` redacts itself in `String()`, JSON, and `util.inspect`.
- `redact()` strips known secret values and credential-shaped strings (`sk-…`, `AIza…`, `ghp_…`, `Bearer …`, `api_key=…`) from any provider error.
- Tests plant a canary key in a provider that echoes it in its errors. The key doesn't appear in responses, logs, audit rows, or stored drafts.

## Natural language → plan (ADR-024)

```
request text ──▶ buildPlannerMessages ──▶ gateway (mock) ──▶ parsePlannerOutput ──▶ plan_drafts (status: ready)
                 fixed system prompt       limits/quota/       strict parse + policy      │
                 user text in               timeouts/retries   + validateSpec            ▼
                 <user_request> block                           FAIL CLOSED          user reviews (specHash)
                                                                                         │ accept
                                                                                         ▼
                                                     workflow definition v1 (not a run) ──▶ POST /runs ──▶ plan approval ──▶ action approvals
```

1. **Input:** the request (1–2,000 characters) plus an optional `kind` and `mode`. Unknown fields are rejected, and an `Idempotency-Key` is required (same rules as runs).
2. **Prompt:**
   - A constant system prompt lists the registry step types and the per-kind policy.
   - It states that the request is data, and that the model can't run tools or change the rules.
   - The request is wrapped in `<user_request>…</user_request>`. Any delimiter tags and control characters inside it are stripped first, so it can't break out of the data block.
3. **Model output is untrusted.** `parsePlannerOutput` accepts **exactly one JSON object** (optionally inside one fenced block). It is validated against a strict `PlannerOutput` schema:
   - Only `kind`, `name`, `description`, and `steps[{id, type, title, dependsOn}]` are allowed, with at most 12 steps and bounded strings.
   - Unknown keys fail the plan. That covers `requiresApproval`, `grantIds`, `tool_calls`, `command`, and anything else.
   - **The server sets the safety fields itself**: `requiresApproval` comes from the registry's effect, `grantIds` is always empty, and `schemaVersion` is 1.
   - The result then goes through `validateSpec`:
     - registry types only, allowed for the kind (`KIND_STEP_POLICY`);
     - an acyclic graph;
     - approval and a preview step before every write.
   - If the user chose a kind, the output must match it.
   - Any failure returns `422 plan_invalid` with our own issue strings (ASCII, at most 200 characters, never raw model text). **Nothing is stored and nothing runs.** There is no automatic repair.
4. **Review:** a stored draft returns `spec`, `specHash`, and plain review rows: where each step runs, whether it writes, and whether it needs approval. `POST …/plans/{id}/accept {specHash}` must echo the reviewed hash. The stored spec is re-validated, then a **workflow definition** is created.
5. **Execution is unchanged.** Accepting creates no run. Running needs `POST /runs`, a hash-bound plan approval, and a hash-bound approval for each action (docs/workflow-engine.md).

**Untrusted inputs in general:**
- File, email, and repository content is never given to the planner; it only sees the user's request.
- When model steps start reading content (later milestones), that content goes in `messages` inside data delimiters. Their outputs are step outputs: data that is previewed, and written only through hash-bound action approvals.
- Model-generated strings (names, titles) are length-limited, stored as data, and rendered as text, never HTML.

## HTTP API

All routes are under `/v1/workspaces/{workspaceId}`. They require a session, a same-origin `Origin` on writes, and workspace membership; foreign ids return 404.

| Method & path | Body | Result |
|---|---|---|
| `POST /plans` + `Idempotency-Key` | `{request, kind?, mode?: "hosted"\|"byok"}` | `201 PlanDraftInfo` or a `200` replay. Errors: `400 idempotency_key_required`; `422 invalid_request` / `plan_invalid {details}` / `idempotency_key_reused`; `429 quota_exceeded`; `503 model_unavailable` / `model_not_configured`; `504 model_timeout`; `502 model_auth_failed` / `model_rejected_request` |
| `GET /plans`, `GET /plans/{id}` | — | Drafts (latest 50), including the user's own request text |
| `POST /plans/{id}/accept` | `{specHash}` | `200` (accepted, `workflowId`) or replay; `409 content_hash_mismatch` / `plan_not_ready` / `plan_invalid` |
| `POST /plans/{id}/discard` | — | `200` or replay; `409` if already accepted |
| `GET /models` | — | Default provider, provider capabilities, `byokAvailable`, stored keys (`provider`, `last4`) |
| `PUT /models/keys/{provider}` | `{apiKey}` (8–512 characters) | `200 {provider, last4, createdAt}`; `404` if the provider doesn't support BYOK; `503 byok_not_configured` |
| `DELETE /models/keys/{provider}` | — | `204` or `404` |

## Data

| Table | Purpose |
|---|---|
| `plan_drafts` | `request_text`, `spec`, `spec_hash`, `status` (`ready` / `accepted` / `discarded`), `provider`, `mode`, `usage`, `workflow_id`, plus an idempotency key and request hash. Unique on `(workspace, user, key)`. |
| `model_credentials` | Ciphertext, IV, tag, wrapped data key, KEK id, `last4`. Unique on `(workspace, provider)`. No plaintext. |
| `quota_reservations` | Adds kind `model_tokens`. On settle, `amount` becomes the actual tokens used. |

Audit events: `plan.generated`, `plan.rejected`, `plan.model_failed`, `plan.accepted`, `plan.discarded`, `model_key.saved`, `model_key.deleted`. They hold ids, kinds, modes, token counts, and issue counts. They never hold request text, model output, or keys.

## Configuration (`apps/api/.env.example`)

| Variable | Default | Notes |
|---|---|---|
| `MODEL_PROVIDER` | `mock` | Anything else refuses to start until D2 is decided. |
| `MODEL_TIMEOUT_MS` | 20000 | Per attempt (100–120000). |
| `MODEL_MAX_ATTEMPTS` | 3 | 1–5, including the first attempt. |
| `MODEL_TOKENS_PER_MONTH` | unset (unlimited) | Hosted-mode token budget per workspace. |
| `BYOK_KEK` | unset (BYOK off) | Base64, 32 bytes. Store it in the secret manager. **Owner-generated.** |
| `BYOK_KEK_ID` | `local-1` | Stored with each ciphertext. Change it when rotating the KEK. |

## Not in this session
- Real provider adapters (blocked on D2).
- KMS integration (blocked on D6).
- Key rotation tooling.
- Model calls inside workflow steps (the step executor is still the deterministic mock).
- Web UI for planning and keys.
- A planner evaluation set with a real model.
