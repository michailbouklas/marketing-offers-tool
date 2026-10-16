import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getGoogleAnalyticsCredentialsKey } from "$lib/server/env";

/**
 * At-rest encryption for the Google Analytics service-account keys stored in
 * `brand_google_analytics_property.credentialsEncrypted`.
 *
 * AES-256-GCM with a random 96-bit IV per value; the auth tag protects the
 * ciphertext against tampering. Payload format (all parts base64):
 *
 *   v1:<iv>:<tag>:<ciphertext>
 *
 * The key comes from `GOOGLE_ANALYTICS_CREDENTIALS_KEY` (32 bytes, base64).
 * Rotation is not supported in v1: changing the key makes every stored
 * credential undecryptable and admins must re-upload them.
 */

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

export class GoogleAnalyticsCryptoUnavailableError extends Error {
  constructor() {
    super(
      "GOOGLE_ANALYTICS_CREDENTIALS_KEY is not configured; Google Analytics credentials cannot be stored or read.",
    );
    this.name = "GoogleAnalyticsCryptoUnavailableError";
  }
}

export class GoogleAnalyticsCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleAnalyticsCryptoError";
  }
}

function requireKey(): Buffer {
  const key = getGoogleAnalyticsCredentialsKey();

  if (!key) {
    throw new GoogleAnalyticsCryptoUnavailableError();
  }

  return key;
}

export function isGoogleAnalyticsCryptoConfigured(): boolean {
  try {
    return getGoogleAnalyticsCredentialsKey() !== undefined;
  } catch {
    return false;
  }
}

export function encryptSecret(
  plain: string,
  key: Buffer = requireKey(),
): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

export function decryptSecret(
  payload: string,
  key: Buffer = requireKey(),
): string {
  const parts = payload.split(":");

  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new GoogleAnalyticsCryptoError(
      "Stored credentials have an unknown format",
    );
  }

  const [, ivB64, tagB64, ciphertextB64] = parts;

  try {
    const decipher = createDecipheriv(
      ALGORITHM,
      key,
      Buffer.from(ivB64, "base64"),
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));

    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextB64, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new GoogleAnalyticsCryptoError(
      "Stored credentials could not be decrypted (wrong key or corrupted data)",
    );
  }
}
