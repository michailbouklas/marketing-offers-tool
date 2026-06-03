import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalObjectStore } from "./object-store.server";
import {
  extensionForContentType,
  referenceKey,
  writeReferenceFile,
} from "./reference-storage";

let workdir: string;
let store: LocalObjectStore;

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), "reference-storage-"));
  store = new LocalObjectStore(workdir);
});

afterEach(() => {
  rmSync(workdir, { recursive: true, force: true });
});

function makeFile(contentType: string, bytes: Buffer, name = "in.bin"): File {
  return new File([new Uint8Array(bytes)], name, { type: contentType });
}

function pathForKey(key: string): string {
  return join(workdir, ...key.split("/"));
}

describe("reference-storage", () => {
  it("maps known image content types to extensions", () => {
    expect(extensionForContentType("image/png")).toBe("png");
    expect(extensionForContentType("image/jpeg")).toBe("jpg");
    expect(extensionForContentType("image/jpg")).toBe("jpg");
    expect(extensionForContentType("image/webp")).toBe("webp");
  });

  it("returns null for non-image content types", () => {
    expect(extensionForContentType("application/json")).toBeNull();
    expect(extensionForContentType("text/plain")).toBeNull();
    expect(extensionForContentType("")).toBeNull();
  });

  it("writes a png file under references/<id>.png", async () => {
    const id = "ref-1";
    const bytes = Buffer.from([1, 2, 3]);

    const result = await writeReferenceFile(
      store,
      id,
      makeFile("image/png", bytes),
    );

    expect(result.localPath).toBe(referenceKey(id, "png"));
    expect(result.localPath).toBe(`references/${id}.png`);
    expect(result.contentType).toBe("image/png");
    expect(result.extension).toBe("png");
    expect(readFileSync(pathForKey(result.localPath)).equals(bytes)).toBe(true);
  });

  it("writes a jpg file under references/<id>.jpg", async () => {
    const bytes = Buffer.from([0xff, 0xd8, 0xff]);
    const result = await writeReferenceFile(
      store,
      "ref-2",
      makeFile("image/jpeg", bytes),
    );
    expect(result.extension).toBe("jpg");
    expect(readFileSync(pathForKey(result.localPath)).equals(bytes)).toBe(true);
  });

  it("writes a webp file under references/<id>.webp", async () => {
    const bytes = Buffer.from([0x52, 0x49, 0x46, 0x46]);
    const result = await writeReferenceFile(
      store,
      "ref-3",
      makeFile("image/webp", bytes),
    );
    expect(result.extension).toBe("webp");
    expect(readFileSync(pathForKey(result.localPath)).equals(bytes)).toBe(true);
  });

  it("rejects application/json content type", async () => {
    await expect(
      writeReferenceFile(
        store,
        "bad",
        makeFile("application/json", Buffer.from("{}")),
      ),
    ).rejects.toThrow(/unsupported/i);
  });

  it("rejects ids that would escape the storage root", async () => {
    await expect(
      writeReferenceFile(
        store,
        "../escape",
        makeFile("image/png", Buffer.from("x")),
      ),
    ).rejects.toThrow();
  });
});
