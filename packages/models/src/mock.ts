import { estimateTokens } from "./gateway";
import { ModelError, type ModelProvider, type ModelRequest, type ModelResponse } from "./types";

export interface MockProviderOptions {
  id?: string;
  supportsByok?: boolean;
  /** Produces the response text. Throw a ModelError to simulate provider failures. */
  respond: (req: ModelRequest, attempt: number) => string | Promise<string>;
}

/**
 * Deterministic in-process provider for development and tests. It needs no
 * key, makes no network calls, and honours the abort signal.
 */
export function createMockProvider(
  opts: MockProviderOptions,
): ModelProvider & { calls: ModelRequest[] } {
  const calls: ModelRequest[] = [];
  return {
    id: opts.id ?? "mock",
    supportsByok: opts.supportsByok ?? false,
    supportsHosted: true,
    requiresCredential: false,
    calls,
    async generate(req, ctx): Promise<ModelResponse> {
      calls.push(req);
      if (ctx.signal.aborted) throw new ModelError("timeout", "aborted");
      const text = await opts.respond(req, calls.length);
      if (ctx.signal.aborted) throw new ModelError("timeout", "aborted");
      const input = req.system.length + req.messages.reduce((n, m) => n + m.content.length, 0);
      return {
        text,
        model: "mock-1",
        finishReason: "stop",
        usage: {
          inputTokens: estimateTokens("x".repeat(input)),
          outputTokens: estimateTokens(text),
        },
      };
    },
  };
}

/** A provider that never answers (only the gateway's timeout ends the call). */
export function createHangingProvider(id = "mock"): ModelProvider {
  return {
    id,
    supportsByok: false,
    supportsHosted: true,
    requiresCredential: false,
    generate: () => new Promise<never>(() => undefined),
  };
}
