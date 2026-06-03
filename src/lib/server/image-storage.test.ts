import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalObjectStore } from "./object-store.server";
import { imageKey, readImageBytes, writeImageBytes } from "./image-storage";

let workdir: string;
let store: LocalObjectStore;

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), "image-storage-"));
  store = new LocalObjectStore(workdir);
});

afterEach(() => {
  rmSync(workdir, { recursive: true, force: true });
});

describe("image-storage", () => {
  it("round-trips bytes through write + read", async () => {
    const id = "abc123";
    const original = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02]);

    await writeImageBytes(store, id, original);
    const read = await readImageBytes(store, id);

    expect(read.equals(original)).toBe(true);
  });

  it("writes to the expected key + path under <uploads>/images/<id>.png", async () => {
    const id = "path-check";
    const key = await writeImageBytes(store, id, Buffer.from("png-bytes"));

    expect(key).toBe(imageKey(id));
    expect(key).toBe(`images/${id}.png`);
    const expected = join(workdir, "images", `${id}.png`);
    expect(readFileSync(expected).toString("utf8")).toBe("png-bytes");
  });

  it("creates the images directory if missing", async () => {
    expect(() => statSync(join(workdir, "images"))).toThrow();
    await writeImageBytes(store, "first", Buffer.from("x"));
    expect(statSync(join(workdir, "images")).isDirectory()).toBe(true);
  });

  it("keeps cross-id reads isolated", async () => {
    await writeImageBytes(store, "alpha", Buffer.from("AAA"));
    await writeImageBytes(store, "beta", Buffer.from("BBB"));

    const alpha = await readImageBytes(store, "alpha");
    const beta = await readImageBytes(store, "beta");

    expect(alpha.toString("utf8")).toBe("AAA");
    expect(beta.toString("utf8")).toBe("BBB");
  });

  it("throws when reading a missing id", async () => {
    await expect(readImageBytes(store, "missing")).rejects.toThrow();
  });

  it("rejects ids that would escape the storage root", async () => {
    await expect(
      writeImageBytes(store, "../escape", Buffer.from("x")),
    ).rejects.toThrow();
    await expect(readImageBytes(store, "..\\windows-escape")).rejects.toThrow();
  });
});
