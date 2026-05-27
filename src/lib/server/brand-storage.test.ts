import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  brandAssetPath,
  brandGuidelinesPath,
  deleteBrandAsset,
  readBrandGuidelines,
  writeBrandAsset,
  writeBrandGuidelines,
} from "./brand-storage";

let workdir: string;

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), "brand-storage-"));
});

afterEach(() => {
  rmSync(workdir, { recursive: true, force: true });
});

function makeFile(contentType: string, bytes: Buffer, name = "in.bin"): File {
  return new File([new Uint8Array(bytes)], name, { type: contentType });
}

describe("brand-storage", () => {
  it("writes a png asset under <uploads>/brands/<slug>/assets/<id>.png", async () => {
    const bytes = Buffer.from([1, 2, 3]);
    const result = await writeBrandAsset(
      workdir,
      "acme",
      "asset-1",
      makeFile("image/png", bytes),
    );
    expect(result.localPath).toBe(
      brandAssetPath(workdir, "acme", "asset-1", "png"),
    );
    expect(result.contentType).toBe("image/png");
    expect(result.extension).toBe("png");
    expect(result.sizeBytes).toBe(bytes.byteLength);
    expect(readFileSync(result.localPath).equals(bytes)).toBe(true);
  });

  it("rejects non-image content types", async () => {
    await expect(
      writeBrandAsset(
        workdir,
        "acme",
        "bad",
        makeFile("application/json", Buffer.from("{}")),
      ),
    ).rejects.toThrow(/unsupported/i);
  });

  for (const slug of ["..", "../escape", "a/b", "a\\b", ""]) {
    it(`rejects unsafe slug ${JSON.stringify(slug)}`, async () => {
      await expect(
        writeBrandAsset(
          workdir,
          slug,
          "asset",
          makeFile("image/png", Buffer.from("x")),
        ),
      ).rejects.toThrow(/invalid brand slug/i);
    });
  }

  for (const id of ["..", "../escape", "a/b", "a\\b", ""]) {
    it(`rejects unsafe asset id ${JSON.stringify(id)}`, async () => {
      await expect(
        writeBrandAsset(
          workdir,
          "acme",
          id,
          makeFile("image/png", Buffer.from("x")),
        ),
      ).rejects.toThrow(/invalid brand asset id/i);
    });
  }

  it("deleteBrandAsset removes the file and is idempotent", async () => {
    const bytes = Buffer.from([9]);
    const result = await writeBrandAsset(
      workdir,
      "acme",
      "asset-del",
      makeFile("image/png", bytes),
    );
    await deleteBrandAsset(workdir, "acme", "asset-del", "png");
    expect(() => readFileSync(result.localPath)).toThrow();
    // Calling again does not throw.
    await deleteBrandAsset(workdir, "acme", "asset-del", "png");
  });

  it("readBrandGuidelines returns null when guidelines file is missing", async () => {
    expect(await readBrandGuidelines(workdir, "acme")).toBeNull();
  });

  it("round-trips guidelines markdown", async () => {
    const markdown = "# Acme brand\n\nUse vibrant colours.";
    await writeBrandGuidelines(workdir, "acme", markdown);
    expect(readFileSync(brandGuidelinesPath(workdir, "acme"), "utf8")).toBe(
      markdown,
    );
    expect(await readBrandGuidelines(workdir, "acme")).toBe(markdown);
  });

  it("rejects unsafe slug when writing guidelines", async () => {
    await expect(writeBrandGuidelines(workdir, "..", "x")).rejects.toThrow(
      /invalid brand slug/i,
    );
  });
});
