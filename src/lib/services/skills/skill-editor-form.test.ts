import { describe, expect, it } from "vitest";
import {
  countLines,
  deleteSkillFormSchema,
  editSkillFormSchema,
  estimateTokens,
  getDefaultSkillFormData,
  normalizeSkillData,
  skillEditorSchema,
} from "./skill-editor-form";

const valid = {
  name: "my-skill-2",
  description: "Does things",
  instructions: "Do the thing.\r\n",
  referenceFiles: [] as Array<{ filename: string; content: string }>,
  agentIds: ["sales-agent"],
};

describe("skillEditorSchema", () => {
  it("accepts a valid skill and applies defaults", () => {
    const r = skillEditorSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.userInvocable).toBe(true);
      expect(r.data.tags).toEqual([]);
      expect(r.data.agentIds).toEqual(["sales-agent"]);
    }
  });

  it.each(["My-Skill", "-a", "a-", "a--b", "a".repeat(65)])(
    "rejects name %s",
    (name) => {
      expect(skillEditorSchema.safeParse({ ...valid, name }).success).toBe(
        false,
      );
    },
  );

  it("rejects empty and too long descriptions", () => {
    expect(
      skillEditorSchema.safeParse({ ...valid, description: "" }).success,
    ).toBe(false);
    expect(
      skillEditorSchema.safeParse({ ...valid, description: "x".repeat(1025) })
        .success,
    ).toBe(false);
  });

  it("rejects blank instructions", () => {
    expect(
      skillEditorSchema.safeParse({ ...valid, instructions: "  \n" }).success,
    ).toBe(false);
  });

  it("rejects bad reference filenames", () => {
    for (const filename of ["Foo.md", "x.txt", "../x.md"]) {
      expect(
        skillEditorSchema.safeParse({
          ...valid,
          referenceFiles: [{ filename, content: "a" }],
        }).success,
      ).toBe(false);
    }
  });

  it("rejects empty reference content", () => {
    expect(
      skillEditorSchema.safeParse({
        ...valid,
        referenceFiles: [{ filename: "a.md", content: " " }],
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate filenames (case-insensitive) with a unique message", () => {
    const r = skillEditorSchema.safeParse({
      ...valid,
      referenceFiles: [
        { filename: "a.md", content: "x" },
        { filename: "a.md", content: "y" },
      ],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toBe(
        "Reference file names must be unique",
      );
    }
  });

  it("requires at least one known assistant", () => {
    const empty = skillEditorSchema.safeParse({ ...valid, agentIds: [] });
    expect(empty.success).toBe(false);
    if (!empty.success) {
      expect(empty.error.issues[0].message).toBe(
        "Select at least one assistant",
      );
    }
    expect(
      skillEditorSchema.safeParse({ ...valid, agentIds: ["nope-agent"] })
        .success,
    ).toBe(false);
  });

  it("edit and delete schemas require a positive integer id", () => {
    expect(editSkillFormSchema.safeParse({ ...valid, id: 3 }).success).toBe(
      true,
    );
    expect(editSkillFormSchema.safeParse({ ...valid, id: 0 }).success).toBe(
      false,
    );
    expect(deleteSkillFormSchema.safeParse({ id: "x" }).success).toBe(false);
  });
});

describe("normalizeSkillData", () => {
  it("trims, normalises newlines and dedupes tags and assistants", () => {
    const out = normalizeSkillData(
      skillEditorSchema.parse({
        ...valid,
        name: "  my-skill-2 ",
        instructions: "l1\r\nl2\r\n\r\n",
        tags: ["b", "a", "b", " a "],
        agentIds: ["sales-agent", "sales-agent", "competition-agent"],
        referenceFiles: [{ filename: "r.md", content: "x\r\ny" }],
      }),
    );
    expect(out.name).toBe("my-skill-2");
    expect(out.instructions).toBe("l1\nl2");
    expect(out.tags).toEqual(["b", "a"]);
    expect(out.agentIds).toEqual(["sales-agent", "competition-agent"]);
    expect(out.referenceFiles).toEqual([{ filename: "r.md", content: "x\ny" }]);
  });
});

describe("getDefaultSkillFormData", () => {
  it("returns an empty draft by default and deep copies a source", () => {
    expect(getDefaultSkillFormData()).toEqual({
      name: "",
      description: "",
      instructions: "",
      userInvocable: true,
      tags: [],
      referenceFiles: [],
      agentIds: [],
    });
    const source = {
      name: "x",
      tags: ["t"],
      referenceFiles: [{ filename: "a.md", content: "c" }],
      agentIds: ["sales-agent" as const],
    };
    const copy = getDefaultSkillFormData(source);
    copy.tags.push("u");
    copy.referenceFiles[0].content = "changed";
    expect(source.tags).toEqual(["t"]);
    expect(source.referenceFiles[0].content).toBe("c");
  });
});

describe("text helpers", () => {
  it("estimates tokens", () => {
    expect(estimateTokens("a b c")).toBe(4);
    expect(estimateTokens("")).toBe(0);
  });
  it("counts lines", () => {
    expect(countLines("a\r\nb")).toBe(2);
    expect(countLines("")).toBe(0);
  });
});
