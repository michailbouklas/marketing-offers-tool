import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertSafeKey,
  LocalObjectStore,
  SupabaseObjectStore,
} from "./object-store.server";

describe("assertSafeKey", () => {
  it("accepts ordinary nested keys", () => {
    expect(assertSafeKey("images/a.png")).toBe("images/a.png");
    expect(assertSafeKey("brands/acme/assets/x.png")).toBe(
      "brands/acme/assets/x.png",
    );
  });

  for (const bad of [
    "",
    "/images/a.png",
    "images\\a.png",
    "../escape.png",
    "images/../../etc/passwd",
    "images/./a.png",
    "a//b.png",
  ]) {
    it(`rejects ${JSON.stringify(bad)}`, () => {
      expect(() => assertSafeKey(bad)).toThrow(/invalid storage key/i);
    });
  }
});

describe("LocalObjectStore", () => {
  let workdir: string;
  let store: LocalObjectStore;

  beforeEach(() => {
    workdir = mkdtempSync(join(tmpdir(), "object-store-"));
    store = new LocalObjectStore(workdir);
  });

  afterEach(() => {
    rmSync(workdir, { recursive: true, force: true });
  });

  it("round-trips binary objects through put/get", async () => {
    const bytes = Buffer.from([1, 2, 3, 4]);
    await store.put("images/a.png", bytes, "image/png");
    expect((await store.get("images/a.png")).equals(bytes)).toBe(true);
  });

  it("tryGet returns null for a missing object", async () => {
    expect(await store.tryGet("images/missing.png")).toBeNull();
  });

  it("get throws for a missing object", async () => {
    await expect(store.get("images/missing.png")).rejects.toThrow();
  });

  it("round-trips text objects", async () => {
    await store.putText("brands/acme/guidelines.md", "# hello");
    expect(await store.getText("brands/acme/guidelines.md")).toBe("# hello");
    expect(await store.getText("brands/none/guidelines.md")).toBeNull();
  });

  it("remove is idempotent", async () => {
    await store.put("images/a.png", Buffer.from([1]), "image/png");
    await store.remove("images/a.png");
    expect(await store.tryGet("images/a.png")).toBeNull();
    await expect(store.remove("images/a.png")).resolves.toBeUndefined();
  });

  it("copies objects between keys", async () => {
    const bytes = Buffer.from([9, 8, 7]);
    await store.put("brands/acme/assets/src.png", bytes, "image/png");
    await store.copy("brands/acme/assets/src.png", "references/dest.png");
    expect((await store.get("references/dest.png")).equals(bytes)).toBe(true);
  });

  it("lists files and folders under a prefix", async () => {
    await store.putText("inspiration/.keep", "");
    await store.putText("inspiration/character-design/_category.md", "---");
    await store.put(
      "inspiration/character-design/hero.png",
      Buffer.from([1]),
      "image/png",
    );

    const root = await store.list("inspiration");
    expect(root).toEqual(
      expect.arrayContaining([
        { name: ".keep", isFolder: false },
        { name: "character-design", isFolder: true },
      ]),
    );

    const category = await store.list("inspiration/character-design");
    expect(category).toEqual(
      expect.arrayContaining([
        { name: "_category.md", isFolder: false },
        { name: "hero.png", isFolder: false },
      ]),
    );
  });

  it("list returns [] for a missing prefix", async () => {
    expect(await store.list("inspiration/none")).toEqual([]);
  });
});

describe("SupabaseObjectStore", () => {
  function makeClient(overrides: Record<string, unknown> = {}) {
    const bucketApi = {
      upload: vi.fn().mockResolvedValue({ error: null }),
      download: vi.fn(),
      remove: vi.fn().mockResolvedValue({ error: null }),
      copy: vi.fn().mockResolvedValue({ error: null }),
      list: vi.fn().mockResolvedValue({ data: [], error: null }),
      ...overrides,
    };
    const client = {
      storage: { from: vi.fn(() => bucketApi) },
    } as never;
    return { client, bucketApi };
  }

  it("uploads with content type and upsert", async () => {
    const { client, bucketApi } = makeClient();
    const store = new SupabaseObjectStore(client, "bucket");
    const bytes = Buffer.from([1, 2]);
    await store.put("images/a.png", bytes, "image/png");
    expect(bucketApi.upload).toHaveBeenCalledWith("images/a.png", bytes, {
      contentType: "image/png",
      upsert: true,
    });
  });

  it("throws when upload reports an error", async () => {
    const { client } = makeClient({
      upload: vi.fn().mockResolvedValue({ error: { message: "boom" } }),
    });
    const store = new SupabaseObjectStore(client, "bucket");
    await expect(
      store.put("images/a.png", Buffer.from([1]), "image/png"),
    ).rejects.toThrow(/boom/);
  });

  it("tryGet returns bytes on success and null on error", async () => {
    const bytes = Buffer.from([5, 6, 7]);
    const blob = new Blob([new Uint8Array(bytes)]);
    const { client } = makeClient({
      download: vi
        .fn()
        .mockResolvedValueOnce({ data: blob, error: null })
        .mockResolvedValueOnce({ data: null, error: { message: "missing" } }),
    });
    const store = new SupabaseObjectStore(client, "bucket");
    expect((await store.tryGet("images/a.png"))?.equals(bytes)).toBe(true);
    expect(await store.tryGet("images/missing.png")).toBeNull();
  });

  it("list maps null-id entries to folders and drops the placeholder", async () => {
    const { client, bucketApi } = makeClient({
      list: vi.fn().mockResolvedValue({
        data: [
          { id: null, name: "character-design" },
          { id: "abc", name: ".keep" },
          { id: "def", name: ".emptyFolderPlaceholder" },
        ],
        error: null,
      }),
    });
    const store = new SupabaseObjectStore(client, "bucket");
    expect(await store.list("inspiration")).toEqual([
      { name: "character-design", isFolder: true },
      { name: ".keep", isFolder: false },
    ]);
    expect(bucketApi.list).toHaveBeenCalledWith("inspiration", {
      limit: 1000,
      sortBy: { column: "name", order: "asc" },
    });
  });

  it("list throws when Supabase reports an error", async () => {
    const { client } = makeClient({
      list: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "boom" },
      }),
    });
    const store = new SupabaseObjectStore(client, "bucket");
    await expect(store.list("inspiration")).rejects.toThrow(/boom/);
  });
});
