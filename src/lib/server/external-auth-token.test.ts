import { describe, expect, it } from "vitest";
import {
  isUserToken,
  signUserToken,
  verifyUserToken,
} from "./external-auth-token";

const SECRET = "test-secret-that-is-long-enough";

describe("external-auth-token", () => {
  it("round-trips an email through sign/verify", () => {
    const token = signUserToken(SECRET, "analyst@phc.cy");

    expect(isUserToken(token)).toBe(true);
    expect(verifyUserToken(SECRET, token)).toEqual({ email: "analyst@phc.cy" });
  });

  it("normalises the email to lowercase/trimmed before signing", () => {
    const token = signUserToken(SECRET, "  Analyst@PHC.cy ");

    expect(verifyUserToken(SECRET, token)).toEqual({ email: "analyst@phc.cy" });
  });

  it("rejects a tampered email part", () => {
    const token = signUserToken(SECRET, "analyst@phc.cy");
    const [prefixAndEmail, signature] = token.split(".");
    const forged = `owui1_${Buffer.from("admin@phc.cy").toString("base64url")}.${signature}`;

    expect(prefixAndEmail.startsWith("owui1_")).toBe(true);
    expect(verifyUserToken(SECRET, forged)).toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    const token = signUserToken("other-secret", "analyst@phc.cy");

    expect(verifyUserToken(SECRET, token)).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(verifyUserToken(SECRET, "")).toBeNull();
    expect(verifyUserToken(SECRET, "not-a-token")).toBeNull();
    expect(verifyUserToken(SECRET, "owui1_")).toBeNull();
    expect(verifyUserToken(SECRET, "owui1_abc")).toBeNull();
    expect(verifyUserToken(SECRET, "owui1_abc.")).toBeNull();
    expect(verifyUserToken("", signUserToken(SECRET, "a@b.c"))).toBeNull();
  });

  it("refuses to sign without a secret or with a non-email", () => {
    expect(() => signUserToken("", "analyst@phc.cy")).toThrow();
    expect(() => signUserToken(SECRET, "not-an-email")).toThrow();
  });
});
