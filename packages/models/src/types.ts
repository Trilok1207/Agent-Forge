import type { Secret } from "./secret";

export type ModelMode = "hosted" | "byok";

/**
 * A provider-neutral request. There is deliberately no `tools` field: models
 * in AgentFlow produce text or JSON data only and can never call tools.
 */
export interface ModelRequest {
  /** What the call is for; used for routing, limits, and audit. */
  purpose: "plan";
  system: string;
  /** Untrusted user/content text goes here, never into `system`. */
  messages: { role: "user" | "assistant"; content: string }[];
  maxOutputTokens: number;
  responseFormat: "json" | "text";
}

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ModelResponse {
  text: string;
  usage: ModelUsage;
  model: string;
  finishReason: "stop" | "length" | "other";
}

export interface CallContext {
  signal: AbortSignal;
  /** Null for providers that need no key (the mock). */
  credential: Secret | null;
}

export interface ModelProvider {
  id: string;
  /** Whether users may bring their own key for this provider. */
  supportsByok: boolean;
  /** Whether the provider can run in hosted mode (with the platform key). */
  supportsHosted: boolean;
  /** False only for in-process providers (the mock). Real providers always need a key. */
  requiresCredential: boolean;
  generate(req: ModelRequest, ctx: CallContext): Promise<ModelResponse>;
}

export type ModelErrorKind =
  | "timeout"
  | "rate_limited"
  | "unavailable"
  | "auth"
  | "bad_request"
  | "invalid_response"
  | "input_too_large"
  | "output_too_large"
  | "quota_exceeded"
  | "not_configured";

const RETRYABLE: ReadonlySet<ModelErrorKind> = new Set(["timeout", "rate_limited", "unavailable"]);

/** Normalised model failure. `message` is always redacted and safe to return. */
export class ModelError extends Error {
  readonly retryable: boolean;
  constructor(
    readonly kind: ModelErrorKind,
    message: string,
  ) {
    super(message);
    this.retryable = RETRYABLE.has(kind);
  }
}
