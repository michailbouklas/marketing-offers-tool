import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  PROVIDER_SUPPORTED_SIZES,
  mapToNearestSupportedSize,
  parseRequestedSize,
  resizeToRequested,
} from "./image-size";

describe("parseRequestedSize", () => {
  it("parses a normal WxH string", () => {
    expect(parseRequestedSize("1280x720")).toEqual({
      width: 1280,
      height: 720,
    });
  });

  it("defaults missing components to 1024", () => {
    expect(parseRequestedSize("x720")).toEqual({ width: 1024, height: 720 });
    expect(parseRequestedSize("1280x")).toEqual({ width: 1280, height: 1024 });
    expect(parseRequestedSize("x")).toEqual({ width: 1024, height: 1024 });
  });

  it("falls back to 1024x1024 on invalid input", () => {
    expect(parseRequestedSize("")).toEqual({ width: 1024, height: 1024 });
    expect(parseRequestedSize(undefined)).toEqual({
      width: 1024,
      height: 1024,
    });
    expect(parseRequestedSize("garbage")).toEqual({
      width: 1024,
      height: 1024,
    });
    expect(parseRequestedSize("0x0")).toEqual({ width: 1024, height: 1024 });
    expect(parseRequestedSize("-10x-20")).toEqual({
      width: 1024,
      height: 1024,
    });
  });

  it("trims whitespace and is case-insensitive on the separator", () => {
    expect(parseRequestedSize(" 1280X720 ")).toEqual({
      width: 1280,
      height: 720,
    });
  });
});

describe("mapToNearestSupportedSize", () => {
  it("maps 1280x720 (widescreen-ish) to 1536x1024", () => {
    expect(mapToNearestSupportedSize({ width: 1280, height: 720 })).toEqual({
      width: 1536,
      height: 1024,
    });
  });

  it("maps 1024x1024 (square) to itself", () => {
    expect(mapToNearestSupportedSize({ width: 1024, height: 1024 })).toEqual({
      width: 1024,
      height: 1024,
    });
  });

  it("maps 768x1280 (tall) to 1024x1536", () => {
    expect(mapToNearestSupportedSize({ width: 768, height: 1280 })).toEqual({
      width: 1024,
      height: 1536,
    });
  });

  it("returns a size from the supported list", () => {
    const out = mapToNearestSupportedSize({ width: 300, height: 500 });
    expect(
      PROVIDER_SUPPORTED_SIZES.some(
        (s) => s.width === out.width && s.height === out.height,
      ),
    ).toBe(true);
  });
});

describe("resizeToRequested", () => {
  it("resizes provider output back to the requested dimensions", async () => {
    const original = await sharp({
      create: {
        width: 1536,
        height: 1024,
        channels: 3,
        background: { r: 10, g: 20, b: 30 },
      },
    })
      .png()
      .toBuffer();

    const resized = await resizeToRequested(original, {
      width: 1280,
      height: 720,
    });

    const meta = await sharp(resized).metadata();
    expect(meta.width).toBe(1280);
    expect(meta.height).toBe(720);
  });

  it("is a no-op when dimensions already match", async () => {
    const original = await sharp({
      create: {
        width: 1024,
        height: 1024,
        channels: 3,
        background: { r: 1, g: 1, b: 1 },
      },
    })
      .png()
      .toBuffer();

    const resized = await resizeToRequested(original, {
      width: 1024,
      height: 1024,
    });

    const meta = await sharp(resized).metadata();
    expect(meta.width).toBe(1024);
    expect(meta.height).toBe(1024);
  });
});

describe("end-to-end: 1280x720 → nearest 1536x1024 → resized 1280x720", () => {
  it("matches the DoD scenario", async () => {
    const requested = parseRequestedSize("1280x720");
    const generation = mapToNearestSupportedSize(requested);
    expect(generation).toEqual({ width: 1536, height: 1024 });

    const providerOutput = await sharp({
      create: {
        width: generation.width,
        height: generation.height,
        channels: 3,
        background: { r: 100, g: 150, b: 200 },
      },
    })
      .png()
      .toBuffer();

    const final = await resizeToRequested(providerOutput, requested);
    const meta = await sharp(final).metadata();
    expect(meta.width).toBe(1280);
    expect(meta.height).toBe(720);
  });
});
