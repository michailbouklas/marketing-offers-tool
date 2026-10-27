import { describe, expect, it } from "vitest";
import { chatAgents } from "$lib/server/mastra/chat-registry";
import { ASSISTANT_IDS, ASSISTANTS, assistantLabel } from "./assistants";

describe("ASSISTANTS", () => {
  it("lists exactly the agents the chat endpoint can route to", () => {
    expect([...ASSISTANT_IDS].sort()).toEqual(Object.keys(chatAgents).sort());
  });

  it("has unique ids and non-empty labels", () => {
    expect(new Set(ASSISTANT_IDS).size).toBe(ASSISTANTS.length);
    for (const assistant of ASSISTANTS) {
      expect(assistant.label.trim().length).toBeGreaterThan(0);
    }
  });

  it("falls back to the id for unknown assistants", () => {
    expect(assistantLabel("sales-agent")).toBe("Sales Assistant");
    expect(assistantLabel("nope")).toBe("nope");
  });
});
