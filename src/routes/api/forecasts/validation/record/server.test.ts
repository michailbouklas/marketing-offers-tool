import { beforeEach, describe, expect, it, vi } from "vitest";
import { error } from "@sveltejs/kit";

vi.mock("$lib/server/auth-guards", () => ({
  requireApiAdminPermission: vi.fn(),
}));

vi.mock("$lib/server/env", () => ({
  getForecastValidationEnv: vi.fn(() => ({
    FORECAST_VALIDATION_ENABLED: true,
    FORECAST_VALIDATION_CRON: "0 6 * * *",
    FORECAST_VALIDATION_TIMEZONE: "Europe/Nicosia",
    FORECAST_VALIDATION_DEFAULT_DAYS: 7,
    FORECAST_VALIDATION_MAX_LAG_DAYS: 14,
    FORECAST_VALIDATION_CONCURRENCY: 2,
  })),
}));

vi.mock("$lib/services/forecasts/forecast-scope.server", () => ({
  FORECASTS_PERMISSION: { forecasts: ["view"] },
}));

vi.mock("$lib/services/forecasts/forecast-validation.server", () => ({
  FORECAST_VALIDATION_MIN_HORIZON_DAYS: 1,
  FORECAST_VALIDATION_MAX_HORIZON_DAYS: 90,
  isForecastValidationRecordInFlight: vi.fn(),
  tryRecordForecastValidationExclusively: vi.fn(),
}));

const guards = await import("$lib/server/auth-guards");
const validation =
  await import("$lib/services/forecasts/forecast-validation.server");
const { POST } = await import("./+server");

const guardMock = vi.mocked(guards.requireApiAdminPermission);
const inFlightMock = vi.mocked(validation.isForecastValidationRecordInFlight);
const recordMock = vi.mocked(validation.tryRecordForecastValidationExclusively);

function httpError(status: number, message: string): unknown {
  try {
    error(status, message);
  } catch (err) {
    return err;
  }
  throw new Error("unreachable");
}

function makeEvent(body: string | null) {
  return {
    request: { text: async () => body ?? "" },
    url: new URL("http://test.local/api/forecasts/validation/record"),
    locals: { session: {}, user: { id: "admin-1" } },
  } as unknown as Parameters<typeof POST>[0];
}

async function statusOf(result: unknown): Promise<number> {
  try {
    await result;
  } catch (err) {
    return (err as { status: number }).status;
  }
  throw new Error("expected the handler to throw");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  guardMock.mockResolvedValue({
    session: {},
    user: { id: "admin-1" },
  } as unknown as Awaited<ReturnType<typeof guards.requireApiAdminPermission>>);
  inFlightMock.mockReturnValue(false);
  recordMock.mockResolvedValue({
    status: "ran",
    summary: {
      batchId: "b",
      trigger: "manual",
      dryRun: false,
      horizonDays: 7,
      brands: ["bk"],
      models: ["blend"],
      recorded: 1,
      duplicates: 0,
      skipped: 0,
      failed: 0,
      startedAt: "",
      finishedAt: "",
      durationMs: 1,
      outcomes: [],
    },
  });
});

describe("POST /api/forecasts/validation/record", () => {
  it("starts a detached run with the default window and answers 202", async () => {
    const response = await POST(makeEvent(null));

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      started: true,
      horizonDays: 7,
    });
    expect(recordMock).toHaveBeenCalledWith({
      horizonDays: 7,
      trigger: "manual",
    });
    expect(guardMock).toHaveBeenCalledWith(expect.anything(), {
      forecasts: ["view"],
    });
  });

  it("honours a custom window", async () => {
    const response = await POST(makeEvent(JSON.stringify({ days: 14 })));

    expect(response.status).toBe(202);
    expect(recordMock).toHaveBeenCalledWith({
      horizonDays: 14,
      trigger: "manual",
    });
  });

  it("answers 400 for a window outside 1..90 or a non-JSON body", async () => {
    const tooLong = await POST(makeEvent(JSON.stringify({ days: 91 })));
    expect(tooLong.status).toBe(400);
    await expect(tooLong.json()).resolves.toMatchObject({
      ok: false,
      reason: expect.stringContaining("days"),
    });

    const garbage = await POST(makeEvent("{not json"));
    expect(garbage.status).toBe(400);
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("answers 409 while a run is in flight", async () => {
    inFlightMock.mockReturnValue(true);

    const response = await POST(makeEvent(null));

    expect(response.status).toBe(409);
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("propagates the admin guard's 403", async () => {
    guardMock.mockRejectedValue(httpError(403, "Forbidden"));

    expect(await statusOf(POST(makeEvent(null)))).toBe(403);
    expect(recordMock).not.toHaveBeenCalled();
  });
});
