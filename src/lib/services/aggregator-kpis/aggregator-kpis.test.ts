import { describe, expect, it } from "vitest";
import {
  buildSectionHealthTrend,
  classifyRetry,
  parseSectionDiagnostics,
  sectionTallyTone,
  type ManifestDiagnostics,
} from "./aggregator-kpis";

/** A minimal-but-valid diagnostics blob, as it arrives from Prisma `Json`. */
function validBlob(): unknown {
  return {
    runId: "batch-123",
    shard: "2/3",
    generatedAt: "2026-07-09T10:00:00Z",
    totalStores: 240,
    recordedStores: 236,
    switchedStores: 234,
    switchFailedStores: 2,
    retryCandidates: 18,
    retriedStores: 12,
    sections: [
      {
        key: "operations",
        total: 236,
        status: { ok: 220, partial: 14, failed: 2, skipped: 0 },
        missingFields: [
          { label: "orderRejections.cardFound", count: 14 },
          { label: "punctuality.cardFound", count: 9 },
        ],
        errors: [{ label: "portal timeout", count: 3 }],
      },
    ],
  };
}

describe("parseSectionDiagnostics", () => {
  it("returns null for null / undefined input", () => {
    expect(parseSectionDiagnostics(null)).toBeNull();
    expect(parseSectionDiagnostics(undefined)).toBeNull();
  });

  it("parses a valid blob into a typed ManifestDiagnostics", () => {
    const parsed = parseSectionDiagnostics(validBlob());
    expect(parsed).not.toBeNull();

    const diagnostics = parsed as ManifestDiagnostics;
    expect(diagnostics.runId).toBe("batch-123");
    expect(diagnostics.shard).toBe("2/3");
    expect(diagnostics.switchFailedStores).toBe(2);
    expect(diagnostics.retriedStores).toBe(12);
    expect(diagnostics.sections).toHaveLength(1);

    const [operations] = diagnostics.sections;
    expect(operations.key).toBe("operations");
    expect(operations.status).toEqual({
      ok: 220,
      partial: 14,
      failed: 2,
      skipped: 0,
    });
    // Free-text labels pass through untouched, order preserved.
    expect(operations.missingFields[0]).toEqual({
      label: "orderRejections.cardFound",
      count: 14,
    });
  });

  it("accepts a null shard (unsharded run)", () => {
    const blob = validBlob() as Record<string, unknown>;
    blob.shard = null;
    const parsed = parseSectionDiagnostics(blob);
    expect(parsed?.shard).toBeNull();
  });

  it("ignores unknown keys so additive scraper changes don't break reads", () => {
    const blob = validBlob() as Record<string, unknown>;
    blob.someFutureField = { anything: true };
    (blob.sections as Record<string, unknown>[])[0].futureSectionField = 42;
    const parsed = parseSectionDiagnostics(blob);
    expect(parsed).not.toBeNull();
    expect(parsed?.sections[0].key).toBe("operations");
  });

  it("returns null (not captured) for a malformed blob", () => {
    // Missing required top-level fields.
    expect(parseSectionDiagnostics({ runId: "only-this" })).toBeNull();
    // Wrong types.
    expect(
      parseSectionDiagnostics({
        ...(validBlob() as object),
        totalStores: "240",
      }),
    ).toBeNull();
    // sections not an array.
    expect(
      parseSectionDiagnostics({ ...(validBlob() as object), sections: {} }),
    ).toBeNull();
    // Primitive garbage.
    expect(parseSectionDiagnostics("nonsense")).toBeNull();
    expect(parseSectionDiagnostics(42)).toBeNull();
  });
});

describe("classifyRetry", () => {
  it("returns 'none' when no section was retried", () => {
    expect(
      classifyRetry([
        { status: "OK", attempts: 1 },
        { status: "PARTIAL", attempts: 1 },
      ]),
    ).toBe("none");
  });

  it("returns 'recovered' when every retried section ended OK", () => {
    expect(
      classifyRetry([
        { status: "OK", attempts: 2 },
        { status: "OK", attempts: 1 },
      ]),
    ).toBe("recovered");
  });

  it("returns 'needs-attention' when a retried section is still PARTIAL/FAILED", () => {
    expect(
      classifyRetry([
        { status: "OK", attempts: 2 },
        { status: "FAILED", attempts: 3 },
      ]),
    ).toBe("needs-attention");
    expect(classifyRetry([{ status: "PARTIAL", attempts: 2 }])).toBe(
      "needs-attention",
    );
  });

  it("ignores never-retried failing sections for the retry axis", () => {
    // Section B is partial but was never retried (attempts=1); the only retried
    // section recovered, so the store counts as recovered on the retry axis.
    expect(
      classifyRetry([
        { status: "OK", attempts: 2 },
        { status: "PARTIAL", attempts: 1 },
      ]),
    ).toBe("recovered");
  });
});

describe("buildSectionHealthTrend", () => {
  /** Builds a diagnostics blob with one section's status tally. */
  function diag(
    runId: string,
    section: {
      key: string;
      ok: number;
      partial: number;
      failed: number;
      skipped: number;
    },
  ): ManifestDiagnostics {
    const total =
      section.ok + section.partial + section.failed + section.skipped;
    return {
      runId,
      shard: null,
      generatedAt: "2026-07-09T10:00:00Z",
      totalStores: total,
      recordedStores: total,
      switchedStores: total,
      switchFailedStores: 0,
      retryCandidates: 0,
      retriedStores: 0,
      sections: [
        {
          key: section.key,
          total,
          status: {
            ok: section.ok,
            partial: section.partial,
            failed: section.failed,
            skipped: section.skipped,
          },
          missingFields: [],
          errors: [],
        },
      ],
    };
  }

  it("sorts runs ascending by startedAt", () => {
    const trend = buildSectionHealthTrend([
      {
        startedAt: "2026-07-02T00:00:00Z",
        diagnostics: diag("b", {
          key: "operations",
          ok: 8,
          partial: 2,
          failed: 0,
          skipped: 0,
        }),
      },
      {
        startedAt: "2026-07-01T00:00:00Z",
        diagnostics: diag("a", {
          key: "operations",
          ok: 10,
          partial: 0,
          failed: 0,
          skipped: 0,
        }),
      },
    ]);
    expect(trend.points.map((p) => p.scrapedAt)).toEqual([
      "2026-07-01T00:00:00Z",
      "2026-07-02T00:00:00Z",
    ]);
  });

  it("computes (partial+failed)/total as a percentage and excludes skipped", () => {
    const trend = buildSectionHealthTrend([
      {
        startedAt: "2026-07-01T00:00:00Z",
        // 2 partial + 2 failed of 10 total (incl. 1 skipped) → 40%.
        diagnostics: diag("a", {
          key: "operations",
          ok: 5,
          partial: 2,
          failed: 2,
          skipped: 1,
        }),
      },
    ]);
    expect(trend.series).toEqual([{ key: "operations", label: "Operations" }]);
    expect(trend.points[0].values.operations).toBe(40);
  });

  it("emits an all-null break point for a null-diagnostics run", () => {
    const trend = buildSectionHealthTrend([
      {
        startedAt: "2026-07-01T00:00:00Z",
        diagnostics: diag("a", {
          key: "operations",
          ok: 8,
          partial: 2,
          failed: 0,
          skipped: 0,
        }),
      },
      { startedAt: "2026-07-02T00:00:00Z", diagnostics: null },
    ]);
    // Legacy run leaves a gap, not a 0.
    expect(trend.points[1].values.operations).toBeNull();
  });

  it("unions section keys across runs (null when a series is absent in a run)", () => {
    const trend = buildSectionHealthTrend([
      {
        startedAt: "2026-07-01T00:00:00Z",
        diagnostics: diag("a", {
          key: "metrics",
          ok: 10,
          partial: 0,
          failed: 0,
          skipped: 0,
        }),
      },
      {
        startedAt: "2026-07-02T00:00:00Z",
        diagnostics: diag("b", {
          key: "operations",
          ok: 8,
          partial: 2,
          failed: 0,
          skipped: 0,
        }),
      },
    ]);
    expect(trend.series.map((s) => s.key)).toEqual(["metrics", "operations"]);
    // metrics absent from run b → null there.
    expect(trend.points[1].values.metrics).toBeNull();
    expect(trend.points[0].values.operations).toBeNull();
  });

  it("returns empty series when no run has diagnostics", () => {
    const trend = buildSectionHealthTrend([
      { startedAt: "2026-07-01T00:00:00Z", diagnostics: null },
    ]);
    expect(trend.series).toEqual([]);
  });
});

describe("sectionTallyTone", () => {
  it("prioritises failed, then partial, then ok, then skipped", () => {
    expect(sectionTallyTone({ ok: 5, partial: 3, failed: 1, skipped: 0 })).toBe(
      "failed",
    );
    expect(sectionTallyTone({ ok: 5, partial: 3, failed: 0, skipped: 0 })).toBe(
      "partial",
    );
    expect(sectionTallyTone({ ok: 5, partial: 0, failed: 0, skipped: 2 })).toBe(
      "ok",
    );
    expect(sectionTallyTone({ ok: 0, partial: 0, failed: 0, skipped: 4 })).toBe(
      "skipped",
    );
  });
});
