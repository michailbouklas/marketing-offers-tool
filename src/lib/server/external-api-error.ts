import { isHttpError, json } from "@sveltejs/kit";

/**
 * Error type + serializer for the external (Open WebUI) API surface. Kept
 * free of app imports so pure helpers (`openai-compat.ts`, `cors.ts`) and
 * their tests can use it without pulling in Prisma or env.
 */

export type ExternalErrorType =
  | "invalid_request_error"
  | "authentication_error"
  | "permission_error"
  | "not_found_error"
  | "server_error";

export class ExternalApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ExternalApiError";
  }

  get type(): ExternalErrorType {
    switch (this.status) {
      case 400:
        return "invalid_request_error";
      case 401:
        return "authentication_error";
      case 403:
        return "permission_error";
      case 404:
        return "not_found_error";
      default:
        return "server_error";
    }
  }
}

/**
 * Serializes any thrown value as an OpenAI-style error body
 * (`{ error: { message, type, code } }`), which Open WebUI renders verbatim.
 * Unknown errors are logged and reported as an opaque 500.
 */
export function externalErrorResponse(
  err: unknown,
  headers: Record<string, string> = {},
): Response {
  if (err instanceof ExternalApiError) {
    return json(
      { error: { message: err.message, type: err.type, code: err.code } },
      {
        status: err.status,
        headers:
          err.status === 401
            ? { ...headers, "WWW-Authenticate": "Bearer" }
            : headers,
      },
    );
  }

  if (isHttpError(err)) {
    return json(
      {
        error: {
          message: err.body.message,
          type: err.status < 500 ? "invalid_request_error" : "server_error",
          code: null,
        },
      },
      { status: err.status, headers },
    );
  }

  console.error("[external-api] unhandled error", err);

  return json(
    {
      error: {
        message: "Internal server error",
        type: "server_error",
        code: null,
      },
    },
    { status: 500, headers },
  );
}
