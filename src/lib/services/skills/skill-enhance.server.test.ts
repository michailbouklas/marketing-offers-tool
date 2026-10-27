import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  text: "",
  ctor: vi.fn(),
  generate: vi.fn(),
}));

vi.mock("@mastra/core/agent", () => ({
  Agent: class {
    constructor(config: unknown) {
      h.ctor(config);
    }
    async generate(messages: unknown) {
      h.generate(messages);
      return { text: h.text };
    }
  },
}));
vi.mock("$lib/server/mastra/env", () => ({
  getSkillEnhanceEnv: () => ({ SKILL_ENHANCE_MODEL: "openai/test-model" }),
}));

const { buildEnhanceMessages, enhanceSkillField } =
  await import("./skill-enhance.server");

describe("buildEnhanceMessages", () => {
  it("builds the description prompt", () => {
    const { system, user } = buildEnhanceMessages({
      field: "description",
      text: "does billing stuff",
      name: "billing-skill",
      instructions: "Step one",
    });
    expect(system).toContain("1024");
    expect(system).toMatch(/do not invent/);
    expect(user).toContain("does billing stuff");
    expect(user).toContain("billing-skill");
    expect(user).toContain("Step one");
  });

  it("builds the instructions prompt", () => {
    const { system, user } = buildEnhanceMessages({
      field: "instructions",
      text: "draft body",
      name: "x",
      description: "Handles invoices",
    });
    expect(system).toMatch(/do not invent/);
    expect(user).toContain("Handles invoices");
    expect(user).toContain("draft body");
  });
});

describe("enhanceSkillField", () => {
  beforeEach(() => {
    h.generate.mockClear();
  });

  it("strips fence and frontmatter for instructions and configures the model", async () => {
    h.text = "```markdown\n---\nname: x\n---\n# Title\nbody\n```";
    const out = await enhanceSkillField({
      field: "instructions",
      text: "draft",
    });
    expect(out).toBe("# Title\nbody");
    expect(h.ctor).toHaveBeenCalledWith(
      expect.objectContaining({ model: "openai/test-model" }),
    );
    expect(h.generate.mock.calls[0][0][0].role).toBe("system");
  });

  it("collapses description whitespace and quotes", async () => {
    h.text = '"Line one.\n\nLine two."';
    expect(await enhanceSkillField({ field: "description", text: "d" })).toBe(
      "Line one. Line two.",
    );
  });

  it("throws on empty output", async () => {
    h.text = "   ";
    await expect(
      enhanceSkillField({ field: "description", text: "d" }),
    ).rejects.toThrow("The model returned an empty response.");
  });
});
