import type { ContentfulStatusCode } from "hono/utils/http-status";

/** Expected, client-visible engine failures. Messages must not include content or secrets. */
export class EngineError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message: string,
    readonly details?: string[],
  ) {
    super(message);
  }
}

export const notFound = () => new EngineError(404, "not_found", "Not found");
