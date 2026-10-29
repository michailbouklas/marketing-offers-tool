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
  getReleaseFormatEnv: () => ({ RELEASE_FORMAT_MODEL: "openai/test-model" }),
}));

const { buildFormatMessages, cleanMarkdown, formatReleaseBody } =
  await import("./release-format.server");

describe("buildFormatMessages", () => {
  it("is a format-only contract and passes the title as context", () => {
    const { system, user } = buildFormatMessages({
      title: "Forecasts",
      body: "- added forecasts\nfixed login",
    });
    expect(system).toMatch(/do not add, remove/);
    expect(system).toMatch(/Do not add a title line/);
    expect(user).toContain("Forecasts");
    expect(user).toContain("fixed login");
  });

  it("omits the title line when the title is blank", () => {
    const { user } = buildFormatMessages({ title: "  ", body: "x" });
    expect(user).not.toContain("Release title");
  });
});

describe("cleanMarkdown", () => {
  it("strips a wrapping code fence and normalises newlines", () => {
    expect(cleanMarkdown("```markdown\r\n## A\r\n\r\n- b\r\n```")).toBe(
      "## A\n\n- b",
    );
  });

  it("leaves inner fences alone", () => {
    const text = "## A\n\n```ts\nconst x = 1;\n```\n\n- b";
    expect(cleanMarkdown(text)).toBe(text);
  });
});

describe("formatReleaseBody", () => {
  beforeEach(() => {
    h.generate.mockClear();
  });

  it("configures the model from env and sends system + user messages", async () => {
    h.text = "```\n## What's new\n\n- Forecasts\n```";
    expect(await formatReleaseBody({ body: "forecasts" })).toBe(
      "## What's new\n\n- Forecasts",
    );
    expect(h.ctor).toHaveBeenCalledWith(
      expect.objectContaining({ model: "openai/test-model" }),
    );
    expect(h.generate.mock.calls[0][0][0].role).toBe("system");
    expect(h.generate.mock.calls[0][0][1].role).toBe("user");
  });

  it("throws on empty output", async () => {
    h.text = "   ";
    await expect(formatReleaseBody({ body: "d" })).rejects.toThrow(
      "The model returned an empty response.",
    );
  });
});
