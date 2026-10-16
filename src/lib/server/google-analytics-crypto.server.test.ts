import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const envState = vi.hoisted(() => ({
  key: undefined as Buffer | undefined,
}));

vi.mock("$lib/server/env", () => ({
  getGoogleAnalyticsCredentialsKey: () => envState.key,
}));

const {
  decryptSecret,
  encryptSecret,
  GoogleAnalyticsCryptoError,
  GoogleAnalyticsCryptoUnavailableError,
  isGoogleAnalyticsCryptoConfigured,
} = await import("./google-analytics-crypto.server");

const SECRET = JSON.stringify({
  type: "service_account",
  client_email: "ga@example.iam.gserviceaccount.com",
  private_key: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n",
});

describe("google-analytics crypto", () => {
  beforeEach(() => {
    envState.key = randomBytes(32);
  });

  it("round-trips a secret and never stores it in clear text", () => {
    const payload = encryptSecret(SECRET);

    expect(payload.startsWith("v1:")).toBe(true);
    expect(payload).not.toContain("service_account");
    expect(payload).not.toContain("PRIVATE KEY");
    expect(decryptSecret(payload)).toBe(SECRET);
  });

  it("uses a fresh IV per call so equal secrets encrypt differently", () => {
    expect(encryptSecret(SECRET)).not.toBe(encryptSecret(SECRET));
  });

  it("rejects tampered ciphertext", () => {
    const payload = encryptSecret(SECRET);
    const parts = payload.split(":");
    const ciphertext = Buffer.from(parts[3], "base64");
    ciphertext[0] ^= 0xff;
    parts[3] = ciphertext.toString("base64");

    expect(() => decryptSecret(parts.join(":"))).toThrow(
      GoogleAnalyticsCryptoError,
    );
  });

  it("rejects a payload encrypted with a different key", () => {
    const payload = encryptSecret(SECRET);
    envState.key = randomBytes(32);

    expect(() => decryptSecret(payload)).toThrow(GoogleAnalyticsCryptoError);
  });

  it("rejects unknown payload formats", () => {
    expect(() => decryptSecret("v0:a:b:c")).toThrow(GoogleAnalyticsCryptoError);
    expect(() => decryptSecret("not-a-payload")).toThrow(
      GoogleAnalyticsCryptoError,
    );
  });

  it("fails closed when the key is not configured", () => {
    envState.key = undefined;

    expect(isGoogleAnalyticsCryptoConfigured()).toBe(false);
    expect(() => encryptSecret(SECRET)).toThrow(
      GoogleAnalyticsCryptoUnavailableError,
    );
    expect(() => decryptSecret("v1:a:b:c")).toThrow(
      GoogleAnalyticsCryptoUnavailableError,
    );
  });

  it("reports configured when a key is present", () => {
    expect(isGoogleAnalyticsCryptoConfigured()).toBe(true);
  });
});
