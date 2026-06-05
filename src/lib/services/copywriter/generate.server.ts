import { z } from "zod";
import { prisma } from "$lib/server/prisma";
import { getBrandGuidelines } from "$lib/services/brand-context/brand-context.server";
import { getTextProvider } from "$lib/services/text-providers/factory.server";
import {
  isProviderRequestError,
  type TextGenerateOutput,
} from "$lib/services/text-providers/types";
import type { Prisma } from "../../../generated/prisma/client";
import type { GeneratedCopyDTO } from "./copywriter";
import {
  CHANNEL_LABELS,
  COPY_TYPE_LABELS,
  VARIANT_COUNT_DEFAULT,
  VARIANT_COUNT_MAX,
  VARIANT_COUNT_MIN,
  getChannelConstraints,
  type CopyFieldConstraint,
  type CopyType,
  type CopyVariant,
} from "./types";

// One retry before giving up, mirroring the image orchestrator: providers
// occasionally return transient 5xx / network errors.
const PROVIDER_ATTEMPTS = 2;

const DEFAULT_TEMPERATURE = 0.8;

export const generateCopyBodySchema = z.object({
  copyType: z.enum([
    "aggregator_offer",
    "social_caption",
    "push_sms",
    "banner_headline",
  ]),
  channel: z.string().min(1, "channel is required"),
  brief: z.string().min(1, "brief is required").max(4000),
  tone: z.string().max(200).optional(),
  variantCount: z
    .number()
    .int()
    .min(VARIANT_COUNT_MIN)
    .max(VARIANT_COUNT_MAX)
    .optional(),
  provider: z.enum(["openai"]),
  model: z.string().min(1).optional(),
  brandId: z.number().int().positive().optional(),
  brandGuidelines: z.string().max(50_000).optional(),
  offerId: z.number().int().positive().optional(),
});

export type GenerateCopyBody = z.infer<typeof generateCopyBodySchema>;

export class CopyGenerateValidationError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 = 400,
  ) {
    super(message);
    this.name = "CopyGenerateValidationError";
  }
}

const COPY_TYPE_BRIEFS: Record<CopyType, string> = {
  aggregator_offer:
    "You are writing the title and description for a restaurant offer listed " +
    "on a food-delivery aggregator app. The copy must make the deal value " +
    "instantly clear, be appetising, and fit the platform's compact listing " +
    "format. No emojis in the title.",
  social_caption:
    "You are writing a social media caption announcing a restaurant offer or " +
    "campaign. It should hook in the first line, be engaging and shareable, " +
    "include a clear call to action, and end with relevant hashtags in the " +
    "hashtags field (not inside the caption).",
  push_sms:
    "You are writing a push notification or SMS for a restaurant offer. It " +
    "must be short, urgent, and action-driving. Every character counts — " +
    "front-load the value.",
  banner_headline:
    "You are writing headline copy for a marketing banner or creative " +
    "visual. The headline must be punchy and scannable at a glance, the " +
    "subheadline adds the supporting detail, and the CTA is a short verb " +
    "phrase.",
};

export function buildCopySystemPrompt(input: {
  copyType: CopyType;
  channel: string;
  fields: CopyFieldConstraint[];
  variantCount: number;
  brandGuidelines?: string | null;
  tone?: string | null;
}): string {
  const parts: string[] = [];

  if (input.brandGuidelines && input.brandGuidelines.trim().length > 0) {
    parts.push(`Brand guidelines:\n${input.brandGuidelines.trim()}`);
  }

  parts.push(
    "You are a senior bilingual (Greek/English) marketing copywriter for a " +
      "restaurant group in Cyprus.",
  );
  parts.push(COPY_TYPE_BRIEFS[input.copyType]);
  parts.push(
    `Target channel: ${CHANNEL_LABELS[input.channel] ?? input.channel} ` +
      `(${COPY_TYPE_LABELS[input.copyType]}).`,
  );

  const limits = input.fields
    .map((f) =>
      f.maxLength
        ? `- ${f.field}: at most ${f.maxLength} characters`
        : `- ${f.field}: no hard limit, keep it concise`,
    )
    .join("\n");
  parts.push(
    `Character limits (apply to each language separately):\n${limits}`,
  );

  parts.push(
    `Produce exactly ${input.variantCount} distinct variants with different ` +
      "angles (e.g. value-led, urgency-led, playful). Each variant must " +
      "contain a Greek (el) version and an English (en) version that convey " +
      "the same message adapted naturally to each language — not a literal " +
      "translation. Use Greek as actually written in Cyprus marketing copy.",
  );

  if (input.tone && input.tone.trim().length > 0) {
    parts.push(`Tone of voice: ${input.tone.trim()}.`);
  }

  return parts.join("\n\n");
}

/**
 * Strict JSON schema for OpenAI structured outputs: every property required
 * and `additionalProperties: false` at every level.
 */
export function buildCopyJsonSchema(input: {
  fields: CopyFieldConstraint[];
  variantCount: number;
}): Record<string, unknown> {
  const languageSchema = {
    type: "object",
    additionalProperties: false,
    required: input.fields.map((f) => f.field),
    properties: Object.fromEntries(
      input.fields.map((f) => [
        f.field,
        {
          type: "string",
          description: f.maxLength
            ? `${f.label} (max ${f.maxLength} characters)`
            : f.label,
        },
      ]),
    ),
  };

  return {
    type: "object",
    additionalProperties: false,
    required: ["variants"],
    properties: {
      variants: {
        type: "array",
        minItems: input.variantCount,
        maxItems: input.variantCount,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["el", "en"],
          properties: { el: languageSchema, en: languageSchema },
        },
      },
    },
  };
}

/**
 * Defensive parse of the provider's structured output. Structured outputs
 * should guarantee the shape, but never trust a provider blindly.
 */
export function parseVariants(
  content: unknown,
  fields: CopyFieldConstraint[],
): CopyVariant[] {
  if (!content || typeof content !== "object") {
    throw new Error("Copy response is not an object");
  }
  const variantsRaw = (content as Record<string, unknown>).variants;
  if (!Array.isArray(variantsRaw) || variantsRaw.length === 0) {
    throw new Error("Copy response did not contain any variants");
  }

  return variantsRaw.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new Error(`Variant ${index + 1} is not an object`);
    }
    const variant: CopyVariant = { el: {}, en: {} };
    for (const lang of ["el", "en"] as const) {
      const langValue = (entry as Record<string, unknown>)[lang];
      if (!langValue || typeof langValue !== "object") {
        throw new Error(
          `Variant ${index + 1} is missing the "${lang}" version`,
        );
      }
      for (const field of fields) {
        const value = (langValue as Record<string, unknown>)[field.field];
        if (typeof value !== "string" || value.trim() === "") {
          throw new Error(
            `Variant ${index + 1} (${lang}) is missing "${field.field}"`,
          );
        }
        variant[lang][field.field] = value.trim();
      }
    }
    return variant;
  });
}

/** Provider bodies/snapshots come from JSON responses, but guard anyway. */
function toJsonValue(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  try {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  } catch {
    return undefined;
  }
}

interface AttemptFailure {
  attempt: number;
  err: unknown;
  durationMs: number;
}

/**
 * Persists the failed attempts collected during generation. Best-effort: a
 * logging failure must never mask the generation result.
 */
async function recordFailureLogs(args: {
  generatedCopyId: string;
  provider: string;
  model: string | null;
  failures: AttemptFailure[];
}): Promise<void> {
  for (const failure of args.failures) {
    const details = isProviderRequestError(failure.err)
      ? {
          responseStatus: failure.err.status,
          responseBody: toJsonValue(failure.err.body),
          requestSnapshot: toJsonValue(failure.err.requestSnapshot),
        }
      : {};
    try {
      await prisma.copyGenerationFailureLog.create({
        data: {
          generatedCopyId: args.generatedCopyId,
          provider: args.provider,
          model: args.model,
          attempt: failure.attempt,
          errorName:
            failure.err instanceof Error ? failure.err.name : "UnknownError",
          errorMessage:
            failure.err instanceof Error
              ? failure.err.message
              : String(failure.err),
          durationMs: failure.durationMs,
          ...details,
        },
      });
    } catch (logErr) {
      console.error(
        "[copywriter] Failed to record copy generation failure log",
        args.generatedCopyId,
        logErr,
      );
    }
  }
}

export function toGeneratedCopyDTO(row: {
  id: string;
  brandId: number | null;
  offerId: number | null;
  copyType: string;
  channel: string;
  brief: string;
  tone: string | null;
  finalPrompt: string;
  provider: string;
  model: string | null;
  variants: unknown;
  status: string;
  errorMessage: string | null;
  durationMs: number | null;
  createdAt: Date;
}): GeneratedCopyDTO {
  return {
    id: row.id,
    brandId: row.brandId,
    offerId: row.offerId,
    copyType: row.copyType as CopyType,
    channel: row.channel,
    brief: row.brief,
    tone: row.tone,
    finalPrompt: row.finalPrompt,
    provider: row.provider,
    model: row.model,
    variants: Array.isArray(row.variants)
      ? (row.variants as unknown as CopyVariant[])
      : [],
    status: row.status as GeneratedCopyDTO["status"],
    errorMessage: row.errorMessage,
    durationMs: row.durationMs,
    createdAt: row.createdAt.toISOString(),
  };
}

interface GenerateCopyArgs {
  userId: string;
  body: GenerateCopyBody;
}

/**
 * Synchronous generation: calls the text provider (with retries + failure
 * logging), persists one GeneratedCopy row, and returns its DTO. Unlike image
 * generation there is no pending state — chat completions are fast enough to
 * await in the request.
 */
export async function generateCopy(
  args: GenerateCopyArgs,
): Promise<GeneratedCopyDTO> {
  const { body } = args;

  const fields = getChannelConstraints(body.copyType, body.channel);
  if (!fields) {
    throw new CopyGenerateValidationError(
      `Channel "${body.channel}" is not valid for copy type "${body.copyType}"`,
    );
  }

  const variantCount = body.variantCount ?? VARIANT_COUNT_DEFAULT;

  // Brand gating mirrors image generation: the brand must be assigned to the
  // user and active. A client-supplied guidelines override takes precedence
  // over the stored guidelines file.
  const brandId = body.brandId ?? null;
  let brandGuidelines: string | null = null;
  if (brandId !== null) {
    const assignment = await prisma.user_brand.findUnique({
      where: { userId_brandId: { userId: args.userId, brandId } },
      select: { brandId: true },
    });
    if (!assignment) {
      throw new CopyGenerateValidationError(
        `Brand ${brandId} is not assigned to this user`,
      );
    }
    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      select: { slug: true, active: true },
    });
    if (!brand || !brand.active || !brand.slug) {
      throw new CopyGenerateValidationError(
        `Brand ${brandId} is not available for copy generation`,
      );
    }
    brandGuidelines =
      body.brandGuidelines !== undefined
        ? body.brandGuidelines
        : await getBrandGuidelines(brand.slug);
  }

  // Offer context enriches the prompt. The offer's brand must be assigned to
  // the user so offer details can't be read across brand boundaries.
  const offerId = body.offerId ?? null;
  let offerContext: string | null = null;
  if (offerId !== null) {
    const offer = await prisma.aggregator_offers.findUnique({
      where: { id: offerId },
      select: {
        name: true,
        aggregator: true,
        details: true,
        starts_at: true,
        ends_at: true,
        brand_id: true,
        brand: { select: { name: true } },
      },
    });
    if (!offer) {
      throw new CopyGenerateValidationError(`Offer ${offerId} not found`, 404);
    }
    const offerAssignment = await prisma.user_brand.findUnique({
      where: {
        userId_brandId: { userId: args.userId, brandId: offer.brand_id },
      },
      select: { brandId: true },
    });
    if (!offerAssignment) {
      throw new CopyGenerateValidationError(
        `Offer ${offerId} belongs to a brand that is not assigned to this user`,
      );
    }
    offerContext = [
      `Offer name: ${offer.name}`,
      `Brand: ${offer.brand.name}`,
      `Aggregator: ${offer.aggregator}`,
      offer.details.trim() ? `Details: ${offer.details.trim()}` : null,
      `Runs from ${offer.starts_at.toISOString().slice(0, 10)} to ${offer.ends_at.toISOString().slice(0, 10)}`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  const systemPrompt = buildCopySystemPrompt({
    copyType: body.copyType,
    channel: body.channel,
    fields,
    variantCount,
    brandGuidelines,
    tone: body.tone,
  });
  const userPrompt = offerContext
    ? `Offer context:\n${offerContext}\n\nBrief:\n${body.brief}`
    : `Brief:\n${body.brief}`;
  const jsonSchema = buildCopyJsonSchema({ fields, variantCount });

  const provider = getTextProvider(body.provider);
  const start = Date.now();
  const failures: AttemptFailure[] = [];
  let output: TextGenerateOutput | null = null;
  let lastError: unknown;

  for (let attempt = 1; attempt <= PROVIDER_ATTEMPTS; attempt++) {
    const attemptStart = Date.now();
    try {
      output = await provider.generateText({
        systemPrompt,
        userPrompt,
        jsonSchema,
        schemaName: `copy_${body.copyType}`,
        model: body.model,
        temperature: DEFAULT_TEMPERATURE,
      });
      break;
    } catch (err) {
      lastError = err;
      failures.push({
        attempt,
        err,
        durationMs: Date.now() - attemptStart,
      });
    }
  }

  let variants: CopyVariant[] = [];
  let errorMessage: string | null = null;
  if (output) {
    try {
      variants = parseVariants(output.content, fields);
    } catch (err) {
      lastError = err;
      errorMessage = err instanceof Error ? err.message : String(err);
    }
  } else {
    errorMessage =
      lastError instanceof Error ? lastError.message : String(lastError);
  }

  const status = variants.length > 0 ? "completed" : "failed";
  const row = await prisma.generatedCopy.create({
    data: {
      userId: args.userId,
      brandId,
      offerId,
      copyType: body.copyType,
      channel: body.channel,
      brief: body.brief,
      tone: body.tone ?? null,
      finalPrompt: systemPrompt,
      provider: body.provider,
      model: body.model ?? null,
      variants: variants as unknown as Prisma.InputJsonValue,
      status,
      errorMessage,
      durationMs: Date.now() - start,
    },
  });

  // Failure logs are written after the row exists so the FK resolves —
  // includes attempts that later succeeded on retry, like the image flow.
  if (failures.length > 0) {
    await recordFailureLogs({
      generatedCopyId: row.id,
      provider: body.provider,
      model: body.model ?? null,
      failures,
    });
  }

  return toGeneratedCopyDTO(row);
}
