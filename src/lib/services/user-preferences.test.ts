import { beforeEach, describe, expect, it, vi } from "vitest";

const executeRaw = vi.fn();
const findUnique = vi.fn();
vi.mock("$lib/server/prisma", () => ({
  prisma: { $executeRaw: executeRaw, user: { findUnique } },
}));

const { getUserPreference, setUserPreference } =
  await import("./user-preferences.server");
const { exploreColumnStateSchema } = await import("./sales-explore");

/** Tagged-template call -> { sql, values }. */
function lastCall() {
  const [strings, ...values] = executeRaw.mock.calls.at(-1)!;
  return { sql: (strings as string[]).join("?"), values };
}

describe("user preferences", () => {
  beforeEach(() => {
    executeRaw.mockReset();
    findUnique.mockReset();
  });

  it("reads one key and defaults to null", async () => {
    findUnique.mockResolvedValueOnce({ meta: { preferences: { a: [1] } } });
    expect(await getUserPreference("u1", "a")).toEqual([1]);
    findUnique.mockResolvedValueOnce({ meta: null });
    expect(await getUserPreference("u1", "a")).toBeNull();
  });

  it("sets a key with bound key, JSON value and user id", async () => {
    await setUserPreference("u1", "salesExplore.columns", [{ x: "'; DROP" }]);
    const { sql, values } = lastCall();
    expect(sql).toContain("jsonb_set");
    expect(sql).toContain("ARRAY['preferences', ?]::text[]");
    expect(values).toEqual([
      "salesExplore.columns",
      JSON.stringify([{ x: "'; DROP" }]),
      "u1",
    ]);
  });

  it("null removes the key", async () => {
    await setUserPreference("u1", "k", null);
    const { sql, values } = lastCall();
    expect(sql).toContain("#- ARRAY['preferences', ?]::text[]");
    expect(values).toEqual(["k", "u1"]);
  });
});

describe("exploreColumnStateSchema", () => {
  const ok = { columnId: "store", order: 0, pinned: null, width: 200 };
  it("accepts grid state incl. the client-only offers column", () => {
    expect(
      exploreColumnStateSchema.safeParse([ok, { ...ok, columnId: "offers" }])
        .success,
    ).toBe(true);
  });
  it("rejects unknown columns and absurd widths", () => {
    expect(
      exploreColumnStateSchema.safeParse([{ ...ok, columnId: "pk" }]).success,
    ).toBe(false);
    expect(
      exploreColumnStateSchema.safeParse([{ ...ok, width: 99_999 }]).success,
    ).toBe(false);
  });
});
