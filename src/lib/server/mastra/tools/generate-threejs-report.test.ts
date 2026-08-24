import { afterEach, describe, expect, it, vi } from "vitest";

const putMock = vi.fn(
  async (_key: string, _bytes: Buffer, _mime: string) => {},
);

vi.mock("../object-store", () => ({
  getObjectStore: () => ({ put: putMock }),
}));

vi.mock("./threejs-assets", () => ({
  getThreeAssets: async () => ({
    threeModuleBase64: Buffer.from("// three stub").toString("base64"),
    threeCoreBase64: Buffer.from("// core stub").toString("base64"),
    orbitControlsBase64: Buffer.from("// orbit stub").toString("base64"),
  }),
}));

const { generateThreeJsReportFile } = await import("./generate-threejs-report");

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function barInput(overrides: Record<string, unknown> = {}) {
  return {
    filename: "sales-by-brand.html",
    title: "Sales by brand",
    chartType: "bar3d" as const,
    labels: ["Brand A", "Brand B"],
    series: [{ name: "June", values: [10, 20] }],
    ...overrides,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("generateThreeJsReportFile validation", () => {
  it("rejects bar3d without labels/series with an ask-the-user instruction", async () => {
    const result = await generateThreeJsReportFile(
      barInput({ labels: undefined, series: undefined }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("ask the user");
    }
    expect(putMock).not.toHaveBeenCalled();
  });

  it("rejects a series whose length does not match the labels", async () => {
    const result = await generateThreeJsReportFile(
      barInput({ series: [{ name: "June", values: [10] }] }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('"June"');
    }
  });

  it("rejects pie3d with more than one series", async () => {
    const result = await generateThreeJsReportFile(
      barInput({
        chartType: "pie3d",
        series: [
          { name: "A", values: [1, 2] },
          { name: "B", values: [3, 4] },
        ],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("exactly one series");
    }
  });

  it("rejects pie3d with non-positive values", async () => {
    const result = await generateThreeJsReportFile(
      barInput({
        chartType: "pie3d",
        series: [{ name: "A", values: [5, 0] }],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("positive");
    }
  });

  it("rejects scatter3d without points", async () => {
    const result = await generateThreeJsReportFile(
      barInput({
        chartType: "scatter3d",
        labels: undefined,
        series: undefined,
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("points");
    }
  });

  it("rejects more than 2000 total values with an aggregate instruction", async () => {
    // The zod schema caps labels at 100, but the exported plain function can
    // be called directly — the cap is defense in depth for that path.
    const labels = Array.from({ length: 300 }, (_, i) => `L${i}`);
    const values = labels.map((_, i) => i);
    const series = Array.from({ length: 8 }, (_, i) => ({
      name: `S${i}`,
      values,
    }));
    const result = await generateThreeJsReportFile(
      barInput({ labels, series }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("aggregate");
    }
    expect(putMock).not.toHaveBeenCalled();
  });
});

describe("generateThreeJsReportFile success path", () => {
  it("stores self-contained html and returns open/download urls", async () => {
    const result = await generateThreeJsReportFile(
      barInput({ filename: "../weird:name" }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fileId).toMatch(UUID_PATTERN);
    expect(result.filename).toBe("weird-name.html");
    expect(result.openUrl).toBe(
      `/api/ai/files/${result.fileId}/${encodeURIComponent(result.filename)}`,
    );
    expect(result.downloadUrl).toBe(`${result.openUrl}?download=1`);
    expect(result.chartType).toBe("bar3d");
    expect(result.pointCount).toBe(2);

    expect(putMock).toHaveBeenCalledTimes(1);
    const [key, bytes, mime] = putMock.mock.calls[0];
    expect(key).toBe(`ai-exports/${result.fileId}/weird-name.html`);
    expect(mime).toBe("text/html; charset=utf-8");

    const html = bytes.toString("utf8");
    expect(html).toContain('<script type="importmap">');
    expect(html).toContain("data:text/javascript;base64,");
    expect(html).toContain("Sales by brand");
    expect(html).toContain('<script type="application/json" id="chart-data">');
  });

  it("escapes markup in titles and json-embedded labels", async () => {
    const result = await generateThreeJsReportFile(
      barInput({
        title: "<script>alert(1)</script>",
        labels: ["</script><b>x</b>", "Brand B"],
      }),
    );

    expect(result.ok).toBe(true);
    const html = putMock.mock.calls[0][1].toString("utf8");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    // Inside the JSON data block every "<" is unicode-escaped, so a label can
    // never terminate the script element.
    expect(html).not.toContain("</script><b>");
    expect(html).toContain("\\u003c/script>\\u003cb>");
  });
});

describe("getThreeAssets (unmocked smoke test)", () => {
  it("resolves the real three.js build files", async () => {
    const actual =
      await vi.importActual<typeof import("./threejs-assets")>(
        "./threejs-assets",
      );
    const assets = await actual.getThreeAssets();
    expect(assets.threeModuleBase64.length).toBeGreaterThan(100_000);
    expect(assets.threeCoreBase64.length).toBeGreaterThan(100_000);
    expect(assets.orbitControlsBase64.length).toBeGreaterThan(1_000);
    const moduleSource = Buffer.from(
      assets.threeModuleBase64,
      "base64",
    ).toString("utf8");
    // Relative imports cannot resolve from a data: URL — the rewrite is load-bearing.
    expect(moduleSource).not.toContain("./three.core.min.js");
    expect(moduleSource).toContain("three-core");
    const head = Buffer.from(assets.orbitControlsBase64, "base64").toString(
      "utf8",
    );
    expect(head).toContain("OrbitControls");
  });
});
