import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  extensionForContentType,
  referenceFilePath,
  writeReferenceFile,
} from "./reference-storage";

let workdir: string;

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), "reference-storage-"));
});

afterEach(() => {
  rmSync(workdir, { recursive: true, force: true });
});

function makeFile(contentType: string, bytes: Buffer, name = "in.bin"): File {
  return new File([new Uint8Array(bytes)], name, { type: contentType });
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

  it("writes a png file under <uploads>/references/<id>.png", async () => {
    const id = "ref-1";
    const bytes = Buffer.from([1, 2, 3]);

    const result = await writeReferenceFile(
      workdir,
      id,
      makeFile("image/png", bytes),
    );

    expect(result.localPath).toBe(referenceFilePath(workdir, id, "png"));
    expect(result.contentType).toBe("image/png");
    expect(result.extension).toBe("png");
    expect(readFileSync(result.localPath).equals(bytes)).toBe(true);
  });

  it("writes a jpg file under <uploads>/references/<id>.jpg", async () => {
    const bytes = Buffer.from([0xff, 0xd8, 0xff]);
    const result = await writeReferenceFile(
      workdir,
      "ref-2",
      makeFile("image/jpeg", bytes),
    );
    expect(result.extension).toBe("jpg");
    expect(readFileSync(result.localPath).equals(bytes)).toBe(true);
  });

  it("writes a webp file under <uploads>/references/<id>.webp", async () => {
    const bytes = Buffer.from([0x52, 0x49, 0x46, 0x46]);
    const result = await writeReferenceFile(
      workdir,
      "ref-3",
      makeFile("image/webp", bytes),
    );
    expect(result.extension).toBe("webp");
    expect(readFileSync(result.localPath).equals(bytes)).toBe(true);
  });

  it("rejects application/json content type", async () => {
    await expect(
      writeReferenceFile(
        workdir,
        "bad",
        makeFile("application/json", Buffer.from("{}")),
      ),
    ).rejects.toThrow(/unsupported/i);
  });

  it("rejects ids that would escape the storage root", async () => {
    await expect(
      writeReferenceFile(
        workdir,
        "../escape",
        makeFile("image/png", Buffer.from("x")),
      ),
    ).rejects.toThrow();
  });
});
