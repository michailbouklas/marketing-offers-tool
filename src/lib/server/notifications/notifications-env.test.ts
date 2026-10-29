import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  hasMailTransport,
  hasNotificationsTransport,
  resetNotificationsEnvForTesting,
} from "./notifications-env";

const KEYS = [
  "SMTP_HOST",
  "NOTIFICATIONS_FROM_EMAIL",
  "SCRAPER_DATABASE_URL",
  "NOTIFICATIONS_ENABLED",
] as const;

const saved: Partial<Record<(typeof KEYS)[number], string | undefined>> = {};

beforeEach(() => {
  for (const key of KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  resetNotificationsEnvForTesting();
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = saved[key];
    }
  }
  resetNotificationsEnvForTesting();
});

// `readEnv` prefers process.env over the .env file, so setting process.env
// here is authoritative even on a machine whose .env has SMTP configured.
describe("hasMailTransport", () => {
  it("needs only an SMTP host and a sender, not the digest queue", () => {
    process.env.SMTP_HOST = "smtp.example";
    process.env.NOTIFICATIONS_FROM_EMAIL = "noreply@example.com";
    process.env.SCRAPER_DATABASE_URL = "";
    process.env.NOTIFICATIONS_ENABLED = "false";
    resetNotificationsEnvForTesting();

    expect(hasMailTransport()).toBe(true);
    expect(hasNotificationsTransport()).toBe(false);
  });

  it("is false without a sender address", () => {
    process.env.SMTP_HOST = "smtp.example";
    process.env.NOTIFICATIONS_FROM_EMAIL = "";
    resetNotificationsEnvForTesting();

    expect(hasMailTransport()).toBe(false);
  });
});
