import { describe, expect, it } from "vitest";
import type { ImageModelConfig } from "./config";
import {
  AUTO_SIZE,
  CUSTOM_SIZE,
  intersectModelSizes,
  parseSize,
  ratioOf,
  sizeLabel,
} from "./model-sizes";

function model(id: string, sizes: string[]): ImageModelConfig {
  return {
    id,
    sizes,
    supportsQuality: true,
    supportsReferences: true,
    supportsMask: false,
  };
}

describe("parseSize", () => {
  it("parses concrete WxH (case-insensitive, with × or spaces)", () => {
    expect(parseSize("1024x576")).toEqual({ width: 1024, height: 576 });
    expect(parseSize("1536X1024")).toEqual({ width: 1536, height: 1024 });
    expect(parseSize("1024 × 576")).toEqual({ width: 1024, height: 576 });
  });

  it("returns null for sentinels and garbage", () => {
    expect(parseSize(AUTO_SIZE)).toBeNull();
    expect(parseSize(CUSTOM_SIZE)).toBeNull();
    expect(parseSize("big")).toBeNull();
    expect(parseSize("0x100")).toBeNull();
  });
});

describe("ratioOf", () => {
  it("reduces to the simplest ratio", () => {
    expect(ratioOf("1024x1024")).toBe("1:1");
    expect(ratioOf("1024x576")).toBe("16:9");
    expect(ratioOf("1536x1024")).toBe("3:2");
  });

  it("returns null for non-concrete sizes", () => {
    expect(ratioOf(AUTO_SIZE)).toBeNull();
    expect(ratioOf(CUSTOM_SIZE)).toBeNull();
  });
});

describe("sizeLabel", () => {
  it("labels concrete sizes with their ratio", () => {
    expect(sizeLabel("1024x576")).toBe("1024×576 · 16:9");
  });

  it("labels the sentinels", () => {
    expect(sizeLabel(AUTO_SIZE)).toBe("Auto (model default)");
    expect(sizeLabel(CUSTOM_SIZE)).toBe("Custom size");
  });
});

describe("intersectModelSizes", () => {
  it("returns a single model's concrete sizes plus auto", () => {
    expect(
      intersectModelSizes([
        model("a", ["1024x1024", "1536x1024", "1024x1536", AUTO_SIZE]),
      ]),
    ).toEqual(["1024x1024", "1536x1024", "1024x1536", AUTO_SIZE]);
  });

  it("intersects concrete sizes across models, preserving order", () => {
    expect(
      intersectModelSizes([
        model("a", ["1024x1024", "1024x576"]),
        model("b", ["1024x576", "768x768"]),
      ]),
    ).toEqual(["1024x576"]);
  });

  it("appends auto only when every model supports it", () => {
    expect(
      intersectModelSizes([
        model("a", ["1024x1024", AUTO_SIZE]),
        model("b", ["1024x1024"]),
      ]),
    ).toEqual(["1024x1024"]);
  });

  it("treats a pure-custom model as unconstraining and offers custom", () => {
    expect(
      intersectModelSizes([
        model("a", ["1024x1024", "1024x576"]),
        model("b", [CUSTOM_SIZE]),
      ]),
    ).toEqual(["1024x1024", "1024x576"]);
  });

  it("offers custom + presets when a model supports both", () => {
    expect(
      intersectModelSizes([model("a", ["1024x1024", AUTO_SIZE, CUSTOM_SIZE])]),
    ).toEqual(["1024x1024", AUTO_SIZE, CUSTOM_SIZE]);
  });

  it("returns [] when concrete sizes don't overlap and auto isn't universal", () => {
    expect(
      intersectModelSizes([
        model("a", ["1024x1024"]),
        model("b", ["1024x576"]),
      ]),
    ).toEqual([]);
  });

  it("returns [] for no models", () => {
    expect(intersectModelSizes([])).toEqual([]);
  });
});
