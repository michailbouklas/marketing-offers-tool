import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/prisma", () => ({ prisma: {} }));

import { messageTextContains } from "./chat-usage.server";

describe("messageTextContains", () => {
  const content = JSON.stringify({
    format: 2,
    parts: [
      { type: "text", text: "Revenue for Nicosia Mall" },
      { type: "tool-querySalesSql", input: { sql: "select secret_column" } },
    ],
  });

  it("matches text parts case-insensitively", () => {
    expect(messageTextContains(content, "nicosia mall")).toBe(true);
  });

  it("ignores JSON keys and tool payloads", () => {
    expect(messageTextContains(content, "text")).toBe(false);
    expect(messageTextContains(content, "secret_column")).toBe(false);
  });

  it("treats non-JSON content as plain text", () => {
    expect(messageTextContains("plain Hello", "hello")).toBe(true);
  });
});
