import { describe, expect, it } from "vitest";
import {
  formatComplianceMarkdown,
  normalizeComplianceVerdict,
  parseComplianceStreamEvent,
  splitNdjson,
} from "./image-compliance";

const image = { width: 100, height: 50 };

describe("normalizeComplianceVerdict", () => {
  it("trims, dedupes case-insensitively and caps findings", () => {
    const result = normalizeComplianceVerdict(
      {
        compliant: false,
        summary: "  off brand  ",
        reasons: [" Logo cropped ", "logo cropped", "", null, "Wrong colour"],
        suggestions: ["a", "b", "c"],
      },
      image,
      2,
    );
    expect(result.summary).toBe("off brand");
    expect(result.reasons).toEqual(["Logo cropped", "Wrong colour"]);
    expect(result.suggestions).toEqual(["a", "b"]);
    expect(result.image).toEqual(image);
  });

  it("forces compliant=false when reasons are present", () => {
    const result = normalizeComplianceVerdict(
      { compliant: true, summary: "", reasons: ["x"], suggestions: [] },
      image,
    );
    expect(result.compliant).toBe(false);
  });

  it("keeps compliant=false when the model gave no reasons", () => {
    const result = normalizeComplianceVerdict(
      { compliant: false, summary: "nope", reasons: [], suggestions: [] },
      image,
    );
    expect(result.compliant).toBe(false);
  });

  it("tolerates missing optional fields", () => {
    const result = normalizeComplianceVerdict({ compliant: true }, image);
    expect(result).toEqual({
      compliant: true,
      summary: "",
      reasons: [],
      suggestions: [],
      image,
    });
  });

  it("throws on a non-verdict payload", () => {
    expect(() => normalizeComplianceVerdict({ foo: 1 }, image)).toThrow();
    expect(() => normalizeComplianceVerdict("text", image)).toThrow();
  });
});

describe("splitNdjson", () => {
  it("returns complete lines and keeps the partial tail", () => {
    const { lines, rest } = splitNdjson('{"a":1}\n{"b":2}\n{"c"');
    expect(lines).toEqual(['{"a":1}', '{"b":2}']);
    expect(rest).toBe('{"c"');
  });

  it("drops blank lines and CR characters", () => {
    const { lines, rest } = splitNdjson('{"a":1}\r\n\r\n{"b":2}\r\n');
    expect(lines).toEqual(['{"a":1}', '{"b":2}']);
    expect(rest).toBe("");
  });
});

describe("parseComplianceStreamEvent", () => {
  it("parses known events", () => {
    expect(
      parseComplianceStreamEvent(
        '{"type":"step-start","step":"prepare-image"}',
      ),
    ).toEqual({ type: "step-start", step: "prepare-image" });
    expect(
      parseComplianceStreamEvent('{"type":"error","message":"boom"}'),
    ).toEqual({ type: "error", message: "boom" });
    expect(
      parseComplianceStreamEvent(
        JSON.stringify({
          type: "done",
          durationMs: 12,
          result: {
            compliant: true,
            summary: "ok",
            reasons: [],
            suggestions: [],
            image,
          },
        }),
      ),
    ).toMatchObject({ type: "done", durationMs: 12 });
  });

  it("returns null for malformed or unknown input", () => {
    expect(parseComplianceStreamEvent("not json")).toBeNull();
    expect(parseComplianceStreamEvent('{"type":"nope"}')).toBeNull();
    expect(
      parseComplianceStreamEvent('{"type":"step-start","step":"other"}'),
    ).toBeNull();
    expect(
      parseComplianceStreamEvent('{"type":"done","result":{}}'),
    ).toBeNull();
  });
});

describe("formatComplianceMarkdown", () => {
  it("renders brand, verdict, summary, findings and suggestions", () => {
    const md = formatComplianceMarkdown({
      fileName: "hero.png",
      brandName: "ACME",
      durationMs: 3610,
      result: {
        compliant: false,
        summary: "Off brand.",
        reasons: ["Red background"],
        suggestions: ["Use blue"],
        image,
      },
    });
    expect(md).toBe(
      [
        "# Compliance check: hero.png",
        "",
        "- **Brand:** ACME",
        "- **Verdict:** Not compliant",
        "- **Checked in:** 3.6s",
        "",
        "## Summary",
        "",
        "Off brand.",
        "",
        "## Findings",
        "",
        "- Red background",
        "",
        "## Suggestions",
        "",
        "- Use blue",
        "",
      ].join("\n"),
    );
  });

  it("omits empty sections and optional fields", () => {
    const md = formatComplianceMarkdown({
      fileName: "ok.png",
      result: {
        compliant: true,
        summary: "",
        reasons: [],
        suggestions: [],
        image,
      },
    });
    expect(md).toBe("# Compliance check: ok.png\n\n- **Verdict:** Compliant\n");
  });
});
