// Types, curated food-photography vocabulary, and the serializer for the
// structured "commented-JSON" prompt format that OpenAI-compatible image
// models respond well to. Browser-safe: the dialog uses the serializer for
// its live preview and the server suggestion service shares the same types.

export interface DetailSystem {
  object: string;
  behavior: string;
}

export interface StructuredPromptState {
  // Header comment
  shortName: string;
  version: string;
  aesthetic: string;
  // GLOBAL_SETTINGS
  aspectRatio: string;
  style: string;
  clarity: string;
  renderFlags: string[];
  // ENVIRONMENT
  background: string;
  lighting: string;
  atmosphere: string[];
  // CORE_ASSETS
  primarySubject: string;
  materials: string[];
  composition: string;
  // MOTION_OR_DETAIL_SYSTEMS
  detailSystems: DetailSystem[];
  // OUTPUT
  mood: string;
  avoid: string[];
}

// AI suggestion response shape — every field optional so the model can fill
// what it can. Shared by the client helper and the server service.
export type StructuredPromptSuggestion = Partial<
  Omit<StructuredPromptState, "version">
>;

export const ASPECT_RATIOS = [
  "2:3 vertical",
  "3:2 horizontal",
  "1:1 square",
  "4:5 vertical",
  "9:16 vertical",
  "16:9 horizontal",
] as const;

export const PHOTO_STYLES = [
  "hyper-realistic commercial photography",
  "editorial food photography",
  "rustic natural-light food photography",
  "dark moody food photography",
  "bright airy minimalist food photography",
  "high-gloss advertising photography",
] as const;

export const CLARITY_OPTIONS = [
  "sharp foreground, micro-texture visibility",
  "shallow depth of field, creamy background blur",
  "edge-to-edge sharpness",
] as const;

export const RENDER_FLAGS = [
  "8K_UHD",
  "sharp_foreground",
  "editorial_finish",
  "studio_quality",
  "high_dynamic_range",
  "micro_texture",
  "no_CGI_tell",
] as const;

export const LIGHTING_SETUPS = [
  "directional softbox with glossy highlights",
  "warm window light from the side",
  "dramatic single-source rim light",
  "diffused overcast daylight",
  "backlit with golden rim glow",
] as const;

export const BACKGROUNDS = [
  "warm gradient studio backdrop",
  "rustic wooden table",
  "dark slate surface",
  "marble countertop",
  "linen tablecloth",
  "neutral seamless paper",
] as const;

export const ATMOSPHERE_EFFECTS = [
  "floating particles",
  "cinematic bokeh",
  "rising steam",
  "soft haze",
  "flour dust in the air",
] as const;

export const FOOD_MATERIALS = [
  "grilled char marks",
  "melted cheese pull",
  "crisp golden crust",
  "fresh herbs",
  "condensation droplets",
  "glossy sauce",
  "toasted sesame seeds",
  "flaky pastry layers",
  "paper wrap",
  "wooden board grain",
] as const;

export const COMPOSITIONS = [
  "diagonal zero-gravity arrangement",
  "centered hero shot",
  "45-degree table angle",
  "top-down flat lay",
  "rule-of-thirds plating",
] as const;

export const DETAIL_OBJECTS = [
  "liquid splash",
  "ingredient fragments",
  "steam wisps",
  "crumbs",
  "sauce drizzle",
  "oil droplets",
] as const;

export const DETAIL_BEHAVIORS = [
  "suspended mid-air",
  "thick glossy arc",
  "slow drizzle",
  "scattered around the base",
  "rising upward",
] as const;

export const MOODS = [
  "premium, indulgent, editorial",
  "fresh and appetizing",
  "cozy and homemade",
  "bold and craveable",
  "clean and healthy",
] as const;

export const AVOID_ITEMS = [
  "cheap e-commerce banner",
  "plastic CGI",
  "fake brand logos",
  "oversaturated colors",
  "messy plating",
  "unappetizing texture",
  "text overlays",
  "watermarks",
] as const;

export function createDefaultStructuredPromptState(): StructuredPromptState {
  return {
    shortName: "",
    version: "1.0.0",
    aesthetic: "Premium Commercial Photography",
    aspectRatio: ASPECT_RATIOS[0],
    style: PHOTO_STYLES[0],
    clarity: CLARITY_OPTIONS[0],
    renderFlags: ["8K_UHD", "sharp_foreground", "editorial_finish"],
    background: BACKGROUNDS[0],
    lighting: LIGHTING_SETUPS[0],
    atmosphere: [],
    primarySubject: "",
    materials: [],
    composition: COMPOSITIONS[0],
    detailSystems: [],
    mood: MOODS[0],
    avoid: ["cheap e-commerce banner", "plastic CGI", "fake brand logos"],
  };
}

function cleanList(values: string[]): string[] {
  return values.map((v) => v.trim()).filter((v) => v !== "");
}

// Serializes the builder state into the commented-JSON prompt block. Pure and
// deterministic so the dialog's live preview and the inserted prompt always
// match. Empty strings, empty arrays, and incomplete detail rows are omitted
// to keep the spec clean.
export function serializeStructuredPrompt(
  state: StructuredPromptState,
): string {
  const set = (obj: Record<string, unknown>, key: string, value: unknown) => {
    if (typeof value === "string") {
      if (value.trim() !== "") obj[key] = value.trim();
    } else if (Array.isArray(value)) {
      if (value.length > 0) obj[key] = value;
    } else if (value !== undefined && value !== null) {
      obj[key] = value;
    }
  };

  const globalSettings: Record<string, unknown> = {};
  set(globalSettings, "aspect_ratio", state.aspectRatio);
  set(globalSettings, "style", state.style);
  set(globalSettings, "clarity", state.clarity);
  set(globalSettings, "render_flags", cleanList(state.renderFlags));

  const environment: Record<string, unknown> = {};
  set(environment, "background", state.background);
  set(environment, "lighting", state.lighting);
  set(environment, "atmosphere", cleanList(state.atmosphere));

  const coreAssets: Record<string, unknown> = {};
  set(coreAssets, "primary_subject", state.primarySubject);
  set(coreAssets, "materials", cleanList(state.materials));
  set(coreAssets, "composition", state.composition);

  const detailSystems = state.detailSystems
    .map((d) => ({ object: d.object.trim(), behavior: d.behavior.trim() }))
    .filter((d) => d.object !== "" && d.behavior !== "");

  const output: Record<string, unknown> = {};
  set(output, "mood", state.mood);
  set(output, "avoid", cleanList(state.avoid));

  const spec: Record<string, unknown> = {};
  set(spec, "GLOBAL_SETTINGS", globalSettings);
  set(spec, "ENVIRONMENT", environment);
  set(spec, "CORE_ASSETS", coreAssets);
  if (detailSystems.length > 0) {
    spec["MOTION_OR_DETAIL_SYSTEMS"] = detailSystems;
  }
  set(spec, "OUTPUT", output);

  const name = state.shortName.trim() || "Food Photography";
  const header = [
    `/* PRODUCT_RENDER_CONFIG: ${name}`,
    `   VERSION: ${state.version.trim() || "1.0.0"}`,
    `   AESTHETIC: ${state.aesthetic.trim() || "Premium Commercial Photography"} */`,
  ].join("\n");

  return `${header}\n${JSON.stringify(spec, null, 2)}`;
}

// Merges AI-suggested values into an existing state, overwriting only the
// fields the suggestion actually provides (non-empty).
export function mergeSuggestionIntoState(
  state: StructuredPromptState,
  suggestion: StructuredPromptSuggestion,
): StructuredPromptState {
  const next = { ...state };
  if (suggestion.shortName?.trim()) next.shortName = suggestion.shortName;
  if (suggestion.aesthetic?.trim()) next.aesthetic = suggestion.aesthetic;
  if (suggestion.aspectRatio?.trim()) next.aspectRatio = suggestion.aspectRatio;
  if (suggestion.style?.trim()) next.style = suggestion.style;
  if (suggestion.clarity?.trim()) next.clarity = suggestion.clarity;
  if (suggestion.renderFlags?.length) {
    next.renderFlags = cleanList(suggestion.renderFlags);
  }
  if (suggestion.background?.trim()) next.background = suggestion.background;
  if (suggestion.lighting?.trim()) next.lighting = suggestion.lighting;
  if (suggestion.atmosphere?.length) {
    next.atmosphere = cleanList(suggestion.atmosphere);
  }
  if (suggestion.primarySubject?.trim()) {
    next.primarySubject = suggestion.primarySubject;
  }
  if (suggestion.materials?.length) {
    next.materials = cleanList(suggestion.materials);
  }
  if (suggestion.composition?.trim()) next.composition = suggestion.composition;
  if (suggestion.detailSystems?.length) {
    next.detailSystems = suggestion.detailSystems
      .map((d) => ({
        object: (d.object ?? "").trim(),
        behavior: (d.behavior ?? "").trim(),
      }))
      .filter((d) => d.object !== "" && d.behavior !== "");
  }
  if (suggestion.mood?.trim()) next.mood = suggestion.mood;
  if (suggestion.avoid?.length) next.avoid = cleanList(suggestion.avoid);
  return next;
}
