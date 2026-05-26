import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  imageFilePath,
  readImageBytes,
  writeImageBytes,
} from "./image-storage";

let workdir: string;

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), "image-storage-"));
});

afterEach(() => {
  rmSync(workdir, { recursive: true, force: true });
});

describe("image-storage", () => {
  it("round-trips bytes through write + read", async () => {
    const id = "abc123";
    const original = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02]);

    await writeImageBytes(workdir, id, original);
    const read = await readImageBytes(workdir, id);

    expect(read.equals(original)).toBe(true);
  });

  it("writes to the expected path under <uploads>/images/<id>.png", async () => {
    const id = "path-check";
    await writeImageBytes(workdir, id, Buffer.from("png-bytes"));

    const expected = imageFilePath(workdir, id);
    expect(expected).toBe(join(workdir, "images", `${id}.png`));
    expect(readFileSync(expected).toString("utf8")).toBe("png-bytes");
  });

  it("creates the images directory if missing", async () => {
    expect(() => statSync(join(workdir, "images"))).toThrow();
    await writeImageBytes(workdir, "first", Buffer.from("x"));
    expect(statSync(join(workdir, "images")).isDirectory()).toBe(true);
  });

  it("keeps cross-id reads isolated", async () => {
    await writeImageBytes(workdir, "alpha", Buffer.from("AAA"));
    await writeImageBytes(workdir, "beta", Buffer.from("BBB"));

    const alpha = await readImageBytes(workdir, "alpha");
    const beta = await readImageBytes(workdir, "beta");

    expect(alpha.toString("utf8")).toBe("AAA");
    expect(beta.toString("utf8")).toBe("BBB");
  });

  it("throws when reading a missing id", async () => {
    await expect(readImageBytes(workdir, "missing")).rejects.toThrow();
  });

  it("rejects ids that would escape the storage root", async () => {
    await expect(
      writeImageBytes(workdir, "../escape", Buffer.from("x")),
    ).rejects.toThrow();
    await expect(
      readImageBytes(workdir, "..\\windows-escape"),
    ).rejects.toThrow();
  });
});
