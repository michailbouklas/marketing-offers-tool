import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Per-user bearer tokens for the Open WebUI bridge.
 *
 * Format: `owui1_<base64url(email)>.<base64url(HMAC-SHA256(secret, "owui1:" + email))>`
 * where `email` is trimmed and lowercased. The token identifies the user on
 * its own, which is what the browser-invoked (user-level) Open WebUI tool
 * server needs — it cannot forward the user's email in a header.
 *
 * Trade-offs (documented in docs/openwebui-integration.md): no database
 * table, no migration and no new dependency; revocation is per user via
 * ban/delete (the auth module re-checks the user on every call) or global
 * by rotating `OPENWEBUI_SHARED_SECRET`.
 *
 * This module stays free of `$env` and app imports so `scripts/` can use it.
 */

const TOKEN_PREFIX = "owui1_";

export function normalizeTokenEmail(email: string): string {
  return email.trim().toLowerCase();
}

function signature(secret: string, email: string): Buffer {
  return createHmac("sha256", secret).update(`owui1:${email}`).digest();
}

export function isUserToken(token: string): boolean {
  return token.startsWith(TOKEN_PREFIX);
}

export function signUserToken(secret: string, email: string): string {
  if (!secret) {
    throw new Error("A non-empty secret is required to sign a user token.");
  }

  const normalized = normalizeTokenEmail(email);

  if (!normalized || !normalized.includes("@")) {
    throw new Error(`"${email}" is not a valid email address.`);
  }

  const emailPart = Buffer.from(normalized, "utf8").toString("base64url");
  const signaturePart = signature(secret, normalized).toString("base64url");

  return `${TOKEN_PREFIX}${emailPart}.${signaturePart}`;
}

/**
 * Returns the embedded email when the token's signature verifies against
 * `secret`; null for anything else (wrong prefix, malformed, tampered).
 */
export function verifyUserToken(
  secret: string,
  token: string,
): { email: string } | null {
  if (!secret || !isUserToken(token)) {
    return null;
  }

  const body = token.slice(TOKEN_PREFIX.length);
  const separator = body.indexOf(".");

  if (separator <= 0 || separator === body.length - 1) {
    return null;
  }

  const email = Buffer.from(body.slice(0, separator), "base64url").toString(
    "utf8",
  );

  // Reject anything that would not round-trip through signUserToken, so a
  // token can never carry a differently-cased or padded email.
  if (!email || normalizeTokenEmail(email) !== email || !email.includes("@")) {
    return null;
  }

  const given = Buffer.from(body.slice(separator + 1), "base64url");
  const expected = signature(secret, email);

  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return null;
  }

  return { email };
}
