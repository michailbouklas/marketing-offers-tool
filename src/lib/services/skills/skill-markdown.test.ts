import matter from "gray-matter";
import { describe, expect, it } from "vitest";
import type { SkillEditorData } from "./skill-editor-form";
import {
  renderSkillMarkdown,
  renderedSkillFiles,
  yamlScalar,
} from "./skill-markdown";

const base: SkillEditorData = {
  name: "store-hours",
  description: "Opening hours",
  instructions: "Body text.",
  userInvocable: true,
  tags: [],
  referenceFiles: [],
  agentIds: ["sales-agent"],
};

describe("renderSkillMarkdown", () => {
  it("renders the minimal form exactly", () => {
    expect(renderSkillMarkdown(base)).toBe(
      '---\nname: store-hours\ndescription: "Opening hours"\n---\nBody text.\n',
    );
  });

  it("JSON-quotes tricky descriptions on one line", () => {
    const description = 'a: b # c "d"\ne';
    const out = renderSkillMarkdown({ ...base, description });
    expect(out.split("\n")[2]).toBe(`description: ${yamlScalar(description)}`);
    expect(out.split("\n")[2]).toBe(
      `description: ${JSON.stringify(description)}`,
    );
  });

  it("emits user-invocable only when false", () => {
    expect(renderSkillMarkdown(base)).not.toContain("user-invocable");
    expect(renderSkillMarkdown({ ...base, userInvocable: false })).toContain(
      "user-invocable: false\n",
    );
  });

  it("emits metadata only with tags and never the assistants", () => {
    expect(renderSkillMarkdown(base)).not.toContain("metadata");
    expect(renderSkillMarkdown(base)).not.toContain("sales-agent");
    expect(renderSkillMarkdown({ ...base, tags: ["a", "b"] })).toContain(
      'metadata:\n  tags: ["a","b"]\n',
    );
  });

  it("normalizes CRLF and trailing whitespace", () => {
    const out = renderSkillMarkdown({
      ...base,
      instructions: "l1\r\nl2\r\n\r\n  ",
    });
    expect(out.endsWith("---\nl1\nl2\n")).toBe(true);
    expect(out).not.toContain("\r");
  });

  it("round-trips through gray-matter (what Mastra parses with)", () => {
    const skill = {
      ...base,
      description: 'a: b # c "d"',
      userInvocable: false,
      tags: ["x", "y"],
    };
    const parsed = matter(renderSkillMarkdown(skill));
    expect(parsed.data.name).toBe("store-hours");
    expect(parsed.data.description).toBe('a: b # c "d"');
    expect(parsed.data["user-invocable"]).toBe(false);
    expect(parsed.data.metadata.tags).toEqual(["x", "y"]);
    expect(parsed.content.trim()).toBe("Body text.");
  });
});

describe("renderedSkillFiles", () => {
  it("lists SKILL.md and references", () => {
    const files = renderedSkillFiles({
      ...base,
      referenceFiles: [{ filename: "sql.md", content: "select 1\r\n\r\n" }],
    });
    expect(files.map((f) => f.path)).toEqual(["SKILL.md", "references/sql.md"]);
    expect(files[1].content).toBe("select 1\n");
  });
});
