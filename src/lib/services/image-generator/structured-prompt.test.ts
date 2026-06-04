import { describe, expect, it } from "vitest";
import {
  createDefaultStructuredPromptState,
  mergeSuggestionIntoState,
  serializeStructuredPrompt,
} from "./structured-prompt";

describe("serializeStructuredPrompt", () => {
  it("emits the commented header and all subsystem sections", () => {
    const state = createDefaultStructuredPromptState();
    state.shortName = "Souvlaki Hero";
    state.primarySubject = "souvlaki wrap on a wooden board";
    state.atmosphere = ["rising steam"];
    state.materials = ["grilled char marks", "paper wrap"];
    state.detailSystems = [
      { object: "sauce drizzle", behavior: "slow drizzle" },
    ];

    const result = serializeStructuredPrompt(state);

    expect(result).toContain("/* PRODUCT_RENDER_CONFIG: Souvlaki Hero");
    expect(result).toContain("VERSION: 1.0.0");
    expect(result).toContain("AESTHETIC: Premium Commercial Photography */");

    const json = JSON.parse(result.slice(result.indexOf("*/") + 2));
    expect(json.GLOBAL_SETTINGS.aspect_ratio).toBe("2:3 vertical");
    expect(json.GLOBAL_SETTINGS.render_flags).toEqual([
      "8K_UHD",
      "sharp_foreground",
      "editorial_finish",
    ]);
    expect(json.ENVIRONMENT.atmosphere).toEqual(["rising steam"]);
    expect(json.CORE_ASSETS.primary_subject).toBe(
      "souvlaki wrap on a wooden board",
    );
    expect(json.MOTION_OR_DETAIL_SYSTEMS).toEqual([
      { object: "sauce drizzle", behavior: "slow drizzle" },
    ]);
    expect(json.OUTPUT.avoid).toContain("plastic CGI");
  });

  it("omits empty strings, empty arrays, and incomplete detail rows", () => {
    const state = createDefaultStructuredPromptState();
    state.primarySubject = "  ";
    state.atmosphere = [];
    state.detailSystems = [
      { object: "steam wisps", behavior: "" },
      { object: "", behavior: "scattered" },
    ];

    const result = serializeStructuredPrompt(state);
    const json = JSON.parse(result.slice(result.indexOf("*/") + 2));

    expect(json.CORE_ASSETS.primary_subject).toBeUndefined();
    expect(json.ENVIRONMENT.atmosphere).toBeUndefined();
    expect(json.MOTION_OR_DETAIL_SYSTEMS).toBeUndefined();
  });

  it("falls back to default header values when blanked", () => {
    const state = createDefaultStructuredPromptState();
    state.shortName = "";
    state.version = " ";
    state.aesthetic = "";

    const result = serializeStructuredPrompt(state);

    expect(result).toContain("/* PRODUCT_RENDER_CONFIG: Food Photography");
    expect(result).toContain("VERSION: 1.0.0");
    expect(result).toContain("AESTHETIC: Premium Commercial Photography */");
  });
});

describe("mergeSuggestionIntoState", () => {
  it("overwrites only fields the suggestion provides", () => {
    const state = createDefaultStructuredPromptState();
    state.primarySubject = "old subject";
    state.materials = ["paper wrap"];

    const next = mergeSuggestionIntoState(state, {
      lighting: "warm window light from the side",
      atmosphere: ["rising steam", " soft haze "],
      shortName: "",
    });

    expect(next.lighting).toBe("warm window light from the side");
    expect(next.atmosphere).toEqual(["rising steam", "soft haze"]);
    // Untouched / empty-suggested fields keep their previous values.
    expect(next.primarySubject).toBe("old subject");
    expect(next.materials).toEqual(["paper wrap"]);
    expect(next.shortName).toBe(state.shortName);
  });

  it("drops incomplete suggested detail rows", () => {
    const state = createDefaultStructuredPromptState();
    const next = mergeSuggestionIntoState(state, {
      detailSystems: [
        { object: "liquid splash", behavior: "thick glossy arc" },
        { object: "crumbs", behavior: " " },
      ],
    });
    expect(next.detailSystems).toEqual([
      { object: "liquid splash", behavior: "thick glossy arc" },
    ]);
  });
});
