import { createHash, timingSafeEqual } from "node:crypto";
import type { RequestContext } from "@mastra/core/request-context";
import type { AppPermissions } from "$lib/auth/permissions";
import { userHasPermissionById } from "$lib/server/auth-guards";
import {
  buildBrandScopeRequestContext,
  type ScopedBrand,
} from "$lib/server/brand-scope.server";
import { getOpenWebUiEnv } from "$lib/server/env";
import { ExternalApiError } from "$lib/server/external-api-error";
import { verifyUserToken } from "$lib/server/external-auth-token";
import {
  CHANNEL_RUNTIME_KEY,
  type ChatChannel,
} from "$lib/server/mastra/chat-registry";
import { prisma } from "$lib/server/prisma";

export {
  ExternalApiError,
  externalErrorResponse,
  type ExternalErrorType,
} from "$lib/server/external-api-error";

/**
 * Authentication for callers outside the app's cookie session — currently the
 * Open WebUI bridge. Two modes share one `Authorization: Bearer` header:
 *
 * - **shared-secret**: the token equals `OPENWEBUI_SHARED_SECRET`; the acting
 *   user is named by the email header Open WebUI forwards. Used by the
 *   OpenAI-compatible model connection and by global (backend-invoked) tool
 *   servers.
 * - **user-token**: an HMAC token minted by `scripts/openwebui-token.ts`
 *   that carries the user's email itself. Used by user-level tool servers,
 *   which the browser calls directly and cannot attach the email header to.
 *   Any email header is ignored in this mode so a browser caller can never
 *   act as someone else.
 *
 * Both modes then resolve the app user by email, require the requested
 * permission and build the server-side brand scope — so external callers get
 * exactly the same data boundary as the in-app chat.
 */

export type ExternalHeaders = {
  email: string | null;
  task: string | null;
  chatId: string | null;
};

function readHeader(request: Request, name: string): string | null {
  const value = request.headers.get(name)?.trim();
  return value ? value : null;
}

/** The Open WebUI forwarded headers, using the configured header names. */
export function readExternalHeaders(request: Request): ExternalHeaders {
  const env = getOpenWebUiEnv();

  return {
    email: readHeader(request, env.OPENWEBUI_USER_EMAIL_HEADER),
    task: readHeader(request, env.OPENWEBUI_TASK_HEADER),
    chatId: readHeader(request, env.OPENWEBUI_CHAT_ID_HEADER),
  };
}

function secureEquals(left: string, right: string): boolean {
  // Hash both sides first so the comparison is constant-time regardless of
  // length and no length information leaks.
  const leftDigest = createHash("sha256").update(left, "utf8").digest();
  const rightDigest = createHash("sha256").update(right, "utf8").digest();

  return timingSafeEqual(leftDigest, rightDigest);
}

/**
 * Extracts the bearer token and asserts the bridge is configured. Does NOT
 * validate the token — `authenticateExternalUser` / `requireExternalKey` do.
 */
export function requireExternalBearer(request: Request): {
  token: string;
  secret: string;
} {
  const secret = getOpenWebUiEnv().OPENWEBUI_SHARED_SECRET;

  if (!secret) {
    throw new ExternalApiError(
      503,
      "not_configured",
      "External access is not configured on this server.",
    );
  }

  const match = /^Bearer\s+(\S+)$/i.exec(
    request.headers.get("authorization") ?? "",
  );

  if (!match) {
    throw new ExternalApiError(
      401,
      "missing_api_key",
      "Missing bearer token. Send an 'Authorization: Bearer <key>' header.",
    );
  }

  return { token: match[1], secret };
}

/**
 * Accepts either the shared secret or any well-formed user token. For
 * endpoints that expose nothing user-specific (e.g. `GET /v1/models`).
 */
export function requireExternalKey(request: Request): void {
  const { token, secret } = requireExternalBearer(request);

  if (!secureEquals(token, secret) && !verifyUserToken(secret, token)) {
    throw new ExternalApiError(401, "invalid_api_key", "Invalid bearer token.");
  }
}

export type ExternalAuthMode = "shared-secret" | "user-token";

export type ExternalCaller = {
  mode: ExternalAuthMode;
  user: { id: string; email: string; name: string; role: string | null };
  /** Index-aligned alias/name pairs; empty when the user has no brands. */
  brands: ScopedBrand[];
  /** Brand-scope keys + CHANNEL_RUNTIME_KEY, ready to hand to the agent. */
  requestContext: RequestContext;
  headers: ExternalHeaders;
};

export async function authenticateExternalUser(
  request: Request,
  options: { permissions: AppPermissions; channel?: ChatChannel },
): Promise<ExternalCaller> {
  const { token, secret } = requireExternalBearer(request);
  const headers = readExternalHeaders(request);

  let mode: ExternalAuthMode;
  let email: string;

  if (secureEquals(token, secret)) {
    mode = "shared-secret";

    if (!headers.email) {
      throw new ExternalApiError(
        401,
        "missing_user_header",
        `Missing user email header '${getOpenWebUiEnv().OPENWEBUI_USER_EMAIL_HEADER}'. ` +
          "Enable user-info header forwarding in Open WebUI or configure a custom header.",
      );
    }

    email = headers.email;
  } else {
    const verified = verifyUserToken(secret, token);

    if (!verified) {
      throw new ExternalApiError(
        401,
        "invalid_api_key",
        "Invalid bearer token.",
      );
    }

    mode = "user-token";
    email = verified.email;
  }

  const user = await prisma.user.findFirst({
    where: { email: { equals: email.trim(), mode: "insensitive" } },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      banned: true,
      banExpires: true,
    },
  });

  if (!user) {
    throw new ExternalApiError(
      403,
      "unknown_user",
      "No marketing-tool user matches this email.",
    );
  }

  if (user.banned && (!user.banExpires || user.banExpires > new Date())) {
    throw new ExternalApiError(403, "user_banned", "This user is banned.");
  }

  if (!(await userHasPermissionById(user.id, options.permissions))) {
    throw new ExternalApiError(
      403,
      "insufficient_permissions",
      "This user is not permitted to use the sales assistant.",
    );
  }

  const channel: ChatChannel = options.channel ?? "openwebui";
  const { requestContext, brands } = await buildBrandScopeRequestContext({
    id: user.id,
    role: user.role,
  });
  requestContext.set(CHANNEL_RUNTIME_KEY, channel);

  console.log(
    `[external-auth] mode=${mode} channel=${channel} email=${user.email} user=${user.id} brands=${brands.length}` +
      (headers.task ? ` task=${headers.task}` : ""),
  );

  return {
    mode,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    brands,
    requestContext,
    headers,
  };
}
