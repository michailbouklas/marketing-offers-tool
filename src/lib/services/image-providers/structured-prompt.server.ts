import type {
  DetailSystem,
  StructuredPromptSuggestion,
} from "$lib/services/image-generator/structured-prompt";
import {
  ASPECT_RATIOS,
  ATMOSPHERE_EFFECTS,
  AVOID_ITEMS,
  BACKGROUNDS,
  CLARITY_OPTIONS,
  COMPOSITIONS,
  DETAIL_BEHAVIORS,
  DETAIL_OBJECTS,
  FOOD_MATERIALS,
  LIGHTING_SETUPS,
  MOODS,
  PHOTO_STYLES,
  RENDER_FLAGS,
} from "$lib/services/image-generator/structured-prompt";

const DEFAULT_MODEL = "gpt-4o-mini";

const SYSTEM_PROMPT = `You are a senior food-photography art director filling in a structured
commercial-photography prompt spec for a text-to-image model.

You will receive a short description of the dish or product to shoot, and
optionally the active brand's design guidelines. Honour the brand guidelines
when they are present (palette, tone, how the brand frames its products).

Reply with a JSON object using exactly these keys (all optional — fill every
key you can with food-photography-appropriate values):
{
  "shortName": "short title for the shot, 2-4 words",
  "aesthetic": "one-line aesthetic label, e.g. Premium Commercial Photography",
  "aspectRatio": "...",
  "style": "...",
  "clarity": "...",
  "renderFlags": ["..."],
  "background": "...",
  "lighting": "...",
  "atmosphere": ["..."],
  "primarySubject": "one vivid sentence describing the hero dish/product",
  "materials": ["visible textures and surface details"],
  "composition": "...",
  "detailSystems": [{"object": "...", "behavior": "..."}],
  "mood": "...",
  "avoid": ["..."]
}

Rules:
- Values must be concrete visual constraints, never vague praise.
- Arrays describe visible elements; keep each entry short (2-6 words).
- Suggest 3-6 materials, 1-3 atmosphere effects, 1-3 detailSystems, and
  3-6 avoid entries.
- Prefer the house vocabulary below when it fits, but you may deviate when
  the scene calls for it:
  aspectRatio: ${ASPECT_RATIOS.join(" | ")}
  style: ${PHOTO_STYLES.join(" | ")}
  clarity: ${CLARITY_OPTIONS.join(" | ")}
  renderFlags: ${RENDER_FLAGS.join(" | ")}
  background: ${BACKGROUNDS.join(" | ")}
  lighting: ${LIGHTING_SETUPS.join(" | ")}
  atmosphere: ${ATMOSPHERE_EFFECTS.join(" | ")}
  materials: ${FOOD_MATERIALS.join(" | ")}
  composition: ${COMPOSITIONS.join(" | ")}
  detail objects: ${DETAIL_OBJECTS.join(" | ")}
  detail behaviors: ${DETAIL_BEHAVIORS.join(" | ")}
  mood: ${MOODS.join(" | ")}
  avoid: ${AVOID_ITEMS.join(" | ")}

Reply with valid JSON only. Do not include any prose outside the JSON object.`;

export interface StructuredPromptSuggesterOptions {
  apiKey: string;
  fetch?: typeof fetch;
  model?: string;
  baseUrl?: string;
}

export class StructuredPromptSuggesterError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = "StructuredPromptSuggesterError";
  }
}

export class StructuredPromptSuggester {
  private readonly fetchFn: typeof fetch;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(private readonly options: StructuredPromptSuggesterOptions) {
    this.fetchFn = options.fetch ?? fetch;
    this.model = options.model ?? DEFAULT_MODEL;
    this.baseUrl = options.baseUrl ?? "https://api.openai.com";
  }

  async suggest(
    description: string,
    brandGuidelines?: string,
  ): Promise<StructuredPromptSuggestion> {
    const guidelines = brandGuidelines?.trim();
    const textContent = guidelines
      ? `Brand design guidelines:\n${guidelines}\n\nScene description:\n${description}`
      : `Scene description:\n${description}`;

    const response = await this.fetchFn(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.options.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: textContent },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const body = await safeJson(response);
      throw new StructuredPromptSuggesterError(
        `Structured prompt suggestion request failed: ${response.status} ${response.statusText}`,
        response.status,
        body,
      );
    }

    const json = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = json.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.trim() === "") {
      throw new StructuredPromptSuggesterError(
        "Structured prompt suggestion returned an empty choice",
        response.status,
        json,
      );
    }

    return parseSuggestionContent(content);
  }
}

// Defensive parse: keep only well-typed values so a sloppy model response
// degrades to a partial prefill instead of failing the request.
function parseSuggestionContent(content: string): StructuredPromptSuggestion {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new StructuredPromptSuggesterError(
      "Structured prompt suggestion returned non-JSON content",
      200,
      content,
    );
  }

  if (!parsed || typeof parsed !== "object") {
    throw new StructuredPromptSuggesterError(
      "Structured prompt suggestion JSON is not an object",
      200,
      parsed,
    );
  }

  const obj = parsed as Record<string, unknown>;
  const result: StructuredPromptSuggestion = {};

  const str = (key: keyof StructuredPromptSuggestion & string) => {
    const value = obj[key];
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
    return undefined;
  };
  const list = (key: keyof StructuredPromptSuggestion & string) => {
    const value = obj[key];
    if (!Array.isArray(value)) return undefined;
    const entries = value
      .filter((v): v is string => typeof v === "string")
      .map((v) => v.trim())
      .filter((v) => v !== "");
    return entries.length > 0 ? entries : undefined;
  };

  result.shortName = str("shortName");
  result.aesthetic = str("aesthetic");
  result.aspectRatio = str("aspectRatio");
  result.style = str("style");
  result.clarity = str("clarity");
  result.renderFlags = list("renderFlags");
  result.background = str("background");
  result.lighting = str("lighting");
  result.atmosphere = list("atmosphere");
  result.primarySubject = str("primarySubject");
  result.materials = list("materials");
  result.composition = str("composition");
  result.detailSystems = normalizeDetailSystems(obj.detailSystems);
  result.mood = str("mood");
  result.avoid = list("avoid");

  return result;
}

function normalizeDetailSystems(value: unknown): DetailSystem[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const systems: DetailSystem[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const object =
      typeof record.object === "string" ? record.object.trim() : "";
    // Accept "state" as an alias — the reference format uses both.
    const behavior =
      typeof record.behavior === "string"
        ? record.behavior.trim()
        : typeof record.state === "string"
          ? record.state.trim()
          : "";
    if (object !== "" && behavior !== "") {
      systems.push({ object, behavior });
    }
  }
  return systems.length > 0 ? systems : undefined;
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.clone().json();
  } catch {
    return null;
  }
}
