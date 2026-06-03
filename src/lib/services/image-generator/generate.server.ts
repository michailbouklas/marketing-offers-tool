import { z } from "zod";
import { prisma } from "$lib/server/prisma";
import { getImageGeneratorEnv } from "$lib/server/env";
import {
  type ImageDimensions,
  mapToNearestSupportedSize,
  parseRequestedSize,
} from "$lib/server/image-size";
import { buildImageGeneratorConfig } from "$lib/services/image-providers/config.server";
import type { ImageModelConfig } from "$lib/services/image-providers/config";
import {
  AUTO_SIZE,
  CUSTOM_SIZE,
  parseSize,
  ratioOf,
} from "$lib/services/image-providers/model-sizes";
import { getBrandGuidelines } from "$lib/services/brand-context/brand-context.server";
import type { GeneratedImageDTO } from "./image-generator";

export const generateBodySchema = z.object({
  prompt: z.string().min(1, "prompt is required"),
  provider: z.enum(["imagerouter", "openai"]),
  model: z.string().min(1).optional(),
  models: z.array(z.string().min(1)).optional(),
  // A concrete "WxH" resolution, or "auto". Authoritative — aspect ratio is
  // derived from this, never a competing input.
  size: z.string().min(1).optional(),
  style: z.string().min(1).optional(),
  camera: z.string().min(1).optional(),
  outputFormat: z.enum(["png", "jpg"]).optional(),
  negativePrompt: z.string().max(2000).optional(),
  quality: z.enum(["auto", "low", "medium", "high"]).optional(),
  background: z.enum(["auto", "opaque", "transparent"]).optional(),
  matchReferences: z.boolean().optional(),
  references: z.array(z.string().min(1)).optional(),
  brandId: z.number().int().positive().optional(),
  brandGuidelines: z.string().max(50_000).optional(),
  allModels: z.boolean().optional(),
  samplesPerModel: z.number().int().positive().optional(),
});

export type GenerateBody = z.infer<typeof generateBodySchema>;

/**
 * Resolves the requested resolution against a single model's real
 * capabilities. The UI already restricts choices to supported sizes, so the
 * snap is mostly a safety net for direct API callers.
 */
export function resolveModelSize(
  requestedSizeStr: string,
  model: ImageModelConfig | undefined,
): { requested: ImageDimensions; generation: ImageDimensions } {
  const concrete = (model?.sizes ?? [])
    .map(parseSize)
    .filter((s): s is ImageDimensions => s !== null);
  const acceptsCustom = model?.sizes.includes(CUSTOM_SIZE) ?? false;

  // "auto": let the model decide — fall back to its primary concrete size
  // (or 1024×1024) so the stored dimensions and resize step stay well-defined.
  if (requestedSizeStr === AUTO_SIZE) {
    const primary = concrete[0] ?? { width: 1024, height: 1024 };
    return { requested: primary, generation: primary };
  }

  const requested = parseRequestedSize(requestedSizeStr);
  if (acceptsCustom || concrete.length === 0) {
    const generation = acceptsCustom
      ? requested
      : mapToNearestSupportedSize(requested);
    return { requested, generation };
  }
  return {
    requested,
    generation: mapToNearestSupportedSize(requested, concrete),
  };
}

export class GenerateValidationError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 = 400,
  ) {
    super(message);
    this.name = "GenerateValidationError";
  }
}

export function buildFinalPrompt(input: {
  prompt: string;
  style?: string | null;
  camera?: string | null;
  aspectRatio?: string | null;
  brandGuidelines?: string | null;
  negativePrompt?: string | null;
}): string {
  const parts: string[] = [];
  if (input.brandGuidelines && input.brandGuidelines.trim().length > 0) {
    parts.push(input.brandGuidelines.trim());
  }
  if (input.style && input.style !== "none") {
    parts.push(`Style: ${input.style}.`);
  }
  if (input.camera && input.camera !== "none") {
    parts.push(`Camera: ${input.camera}.`);
  }
  if (input.aspectRatio && input.aspectRatio !== "none") {
    parts.push(`Aspect ratio: ${input.aspectRatio}.`);
  }
  parts.push(input.prompt);
  // gpt-image-1 has no native negative-prompt parameter, so steer the model
  // away from unwanted content through the prompt text instead.
  if (input.negativePrompt && input.negativePrompt.trim().length > 0) {
    parts.push(`Avoid the following: ${input.negativePrompt.trim()}.`);
  }
  return parts.join(" ");
}

interface CreatePendingArgs {
  userId: string;
  body: GenerateBody;
}

export async function createPendingGenerations(
  args: CreatePendingArgs,
): Promise<GeneratedImageDTO[]> {
  const env = getImageGeneratorEnv();
  const config = await buildImageGeneratorConfig();
  const provider = config.providers.find((p) => p.id === args.body.provider);
  if (!provider) {
    throw new GenerateValidationError(
      `Provider "${args.body.provider}" is not configured`,
    );
  }
  const providerModelIds = provider.models.map((m) => m.id);
  const modelById = new Map(provider.models.map((m) => [m.id, m]));

  const samplesPerModel =
    args.body.samplesPerModel ??
    (args.body.allModels || (args.body.models?.length ?? 0) > 1 ? 3 : 1);
  if (samplesPerModel > env.SAMPLES_PER_MODEL_MAX) {
    throw new GenerateValidationError(
      `samplesPerModel ${samplesPerModel} exceeds max ${env.SAMPLES_PER_MODEL_MAX}`,
    );
  }

  // Resolution order:
  //   1. body.models (explicit multi-select from the composer) — must all be
  //      configured for the provider.
  //   2. body.allModels (legacy "fan out across the provider").
  //   3. [body.model ?? env.DEFAULT_MODEL] (single-model legacy path).
  let models: string[];
  const explicitModels = args.body.models?.filter((m) => m.length > 0) ?? [];
  if (explicitModels.length > 0) {
    const unknown = explicitModels.filter((m) => !providerModelIds.includes(m));
    if (unknown.length > 0) {
      throw new GenerateValidationError(
        `Models not configured for provider "${args.body.provider}": ${unknown.join(", ")}`,
      );
    }
    // De-duplicate while preserving the first-seen order.
    models = [...new Set(explicitModels)];
  } else if (args.body.allModels) {
    models = [...providerModelIds];
  } else {
    models = [args.body.model ?? env.DEFAULT_MODEL];
  }
  if (models.length === 0) {
    throw new GenerateValidationError(
      `Provider "${args.body.provider}" has no configured models`,
    );
  }

  // Resolution is the single source of truth; aspect ratio is derived from it.
  const sizeStr = args.body.size ?? "1024x1024";
  const aspectRatio = sizeStr === AUTO_SIZE ? null : ratioOf(sizeStr);

  const referenceIds = args.body.references ?? [];
  if (referenceIds.length > 0) {
    const owned = await prisma.referenceImage.findMany({
      where: { id: { in: referenceIds }, userId: args.userId },
      select: { id: true },
    });
    if (owned.length !== referenceIds.length) {
      throw new GenerateValidationError(
        "One or more references are unknown or do not belong to this user",
      );
    }
  }

  const brandId = args.body.brandId ?? null;
  let brandGuidelines: string | null = null;
  if (brandId !== null) {
    const assignment = await prisma.user_brand.findUnique({
      where: { userId_brandId: { userId: args.userId, brandId } },
      select: { brandId: true },
    });
    if (!assignment) {
      throw new GenerateValidationError(
        `Brand ${brandId} is not assigned to this user`,
      );
    }
    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      select: { slug: true, active: true },
    });
    if (!brand || !brand.active || !brand.slug) {
      throw new GenerateValidationError(
        `Brand ${brandId} is not available for image generation`,
      );
    }
    // A client-supplied override (edited in the composer) takes precedence over
    // the stored guidelines file; undefined means "use the brand's saved file".
    brandGuidelines =
      args.body.brandGuidelines !== undefined
        ? args.body.brandGuidelines
        : await getBrandGuidelines(brand.slug);
  }

  // Aspect ratio is enforced by the real `size` sent to the provider, so it is
  // no longer injected into the prompt text — only stored (derived) for history.
  const finalPrompt = buildFinalPrompt({
    prompt: args.body.prompt,
    style: args.body.style,
    camera: args.body.camera,
    brandGuidelines,
    negativePrompt: args.body.negativePrompt,
  });

  // "Match references closely" only makes sense when references are attached;
  // it maps to OpenAI's input_fidelity: "high".
  const inputFidelity =
    args.body.matchReferences && referenceIds.length > 0 ? "high" : null;

  const rows: GeneratedImageDTO[] = [];
  for (const model of models) {
    // Each model may support a different set of resolutions, so resolve the
    // requested size against that model's capabilities.
    const { requested, generation } = resolveModelSize(
      sizeStr,
      modelById.get(model),
    );
    for (let i = 0; i < samplesPerModel; i++) {
      const row = await prisma.generatedImage.create({
        data: {
          userId: args.userId,
          brandId,
          prompt: args.body.prompt,
          finalPrompt,
          provider: args.body.provider,
          model,
          requestedWidth: requested.width,
          requestedHeight: requested.height,
          generationWidth: generation.width,
          generationHeight: generation.height,
          style: args.body.style ?? null,
          camera: args.body.camera ?? null,
          aspectRatio,
          negativePrompt: args.body.negativePrompt ?? null,
          quality: args.body.quality ?? null,
          background: args.body.background ?? null,
          inputFidelity,
          referenceIds,
          status: "pending",
        },
      });
      rows.push({
        id: row.id,
        prompt: row.prompt,
        finalPrompt: row.finalPrompt,
        provider: row.provider,
        model: row.model,
        requestedWidth: row.requestedWidth,
        requestedHeight: row.requestedHeight,
        generationWidth: row.generationWidth,
        generationHeight: row.generationHeight,
        style: row.style,
        camera: row.camera,
        aspectRatio: row.aspectRatio,
        negativePrompt: row.negativePrompt,
        quality: row.quality,
        background: row.background,
        inputFidelity: row.inputFidelity,
        referenceIds,
        status: "pending",
        errorMessage: null,
        durationMs: null,
        createdAt:
          row.createdAt instanceof Date
            ? row.createdAt.toISOString()
            : String(row.createdAt),
      });
    }
  }

  return rows;
}
