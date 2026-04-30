import { describe, expect, it } from "vitest";
import {
  getInsecurePasswordSubmissionMessage,
  isSecurePasswordSubmissionContext,
} from "./transport-security";

describe("transport-security", () => {
  it("allows password submissions over https", () => {
    expect(
      isSecurePasswordSubmissionContext({
        protocol: "https:",
        hostname: "offers.internal",
      }),
    ).toBe(true);
  });

  it("allows localhost http during development", () => {
    expect(
      isSecurePasswordSubmissionContext({
        protocol: "http:",
        hostname: "localhost",
      }),
    ).toBe(true);
  });

  it("blocks password submissions over plain http on network hosts", () => {
    expect(
      getInsecurePasswordSubmissionMessage({
        protocol: "http:",
        hostname: "10.0.0.15",
      }),
    ).toContain("HTTPS");
  });
});
