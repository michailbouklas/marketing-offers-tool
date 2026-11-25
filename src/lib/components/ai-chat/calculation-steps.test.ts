import { describe, expect, it } from "vitest";
import { calculationSteps } from "./calculation-steps";

const sqlPart = {
  type: "tool-querySalesSql",
  toolCallId: "call_1",
  state: "output-available",
  input: { sql: "SELECT 1" },
  output: {
    ok: true,
    rowCount: 200,
    truncated: true,
    rows: Array(200).fill({}),
  },
};

describe("calculationSteps", () => {
  it("lists a SQL call with its SQL, row count and cut warning", () => {
    expect(calculationSteps([{ type: "text", text: "hi" }, sqlPart])).toEqual([
      {
        key: "call_1",
        label: "Sales database query",
        inputs: [],
        rawInput: null,
        sql: "SELECT 1",
        returned: [{ label: "rows", count: 200 }],
        truncated: true,
        failed: false,
      },
    ]);
  });

  it("describes a typed tool: merged date range, filters, named lists", () => {
    const [step] = calculationSteps([
      {
        type: "tool-getItemAnalysis",
        state: "output-available",
        input: {
          brand: "phcy",
          from: "2026-11-01",
          to: "2026-11-07",
          channels: ["Wolt", "Bolt"],
          categories: null,
          limit: 30,
        },
        output: {
          ok: true,
          categories: [{}, {}],
          items: [{}, {}, {}],
          truncated: false,
        },
      },
    ]);
    expect(step.label).toBe("Get item analysis");
    expect(step.inputs).toEqual([
      { label: "Date range", value: "2026-11-01 to 2026-11-07" },
      { label: "Brand", value: "phcy" },
      { label: "Channels", value: "Wolt, Bolt" },
      { label: "Limit", value: "30" },
    ]);
    expect(step.returned).toEqual([
      { label: "categories", count: 2 },
      { label: "items", count: 3 },
    ]);
    expect(step.truncated).toBe(false);
  });

  it("finds nested and suffixed truncation flags, and nested row lists", () => {
    const [nested, suffixed] = calculationSteps([
      {
        type: "tool-getDeliveryOverview",
        state: "output-available",
        input: {},
        output: {
          ok: true,
          locations: { rows: [{}], total: 9, truncated: true },
        },
      },
      {
        type: "tool-getConsolidatedOptions",
        state: "output-available",
        input: {},
        output: { ok: true, stores: [], storesTruncated: true },
      },
    ]);
    expect(nested.truncated).toBe(true);
    expect(nested.returned).toEqual([{ label: "locations", count: 1 }]);
    expect(suffixed.truncated).toBe(true);
  });

  it("falls back to name plus raw input for unknown tools", () => {
    const [step] = calculationSteps([
      {
        type: "dynamic-tool",
        toolName: "lookup_thing",
        state: "output-available",
        input: { id: 7 },
        output: "plain text",
      },
    ]);
    expect(step).toMatchObject({
      label: "Lookup thing",
      inputs: [],
      rawInput: JSON.stringify({ id: 7 }, null, 2),
      returned: [],
    });
  });

  it("marks failures and tolerates history rows stored without input", () => {
    const steps = calculationSteps([
      { type: "tool-querySalesSql", state: "output-error", errorText: "boom" },
      {
        type: "tool-queryInvoicesSql",
        state: "output-available",
        output: { ok: false, error: "bad sql" },
      },
    ]);
    expect(steps.map((step) => step.failed)).toEqual([true, true]);
    expect(steps[0]).toMatchObject({ sql: null, rawInput: null, key: "0" });
  });

  it("skips output tools, skills and calls that never finished", () => {
    expect(
      calculationSteps([
        { type: "tool-generateExcel", state: "output-available", output: {} },
        { type: "tool-generateChart", state: "output-available", output: {} },
        { type: "tool-generateThreeJsReport", state: "output-available" },
        { type: "tool-skill", state: "output-available", input: { name: "x" } },
        { type: "tool-mastra_workspace_read", state: "output-available" },
        { ...sqlPart, state: "input-available" },
      ]),
    ).toEqual([]);
  });
});
