import { z } from "zod";
import { prisma } from "$lib/server/prisma";
import { getImageGeneratorEnv } from "$lib/server/env";
import {
  mapToNearestSupportedSize,
  parseRequestedSize,
} from "$lib/server/image-size";
import { buildImageGeneratorConfig } from "$lib/services/image-providers/config.server";
import type { GeneratedImageDTO } from "./image-generator";

export const generateBodySchema = z.object({
  prompt: z.string().min(1, "prompt is required"),
  provider: z.enum(["imagerouter", "openai"]),
  model: z.string().min(1).optional(),
  size: z.string().min(1).optional(),
  style: z.string().min(1).optional(),
  camera: z.string().min(1).optional(),
  aspectRatio: z.enum(["square", "widescreen", "tiktok"]).optional(),
  references: z.array(z.string().min(1)).optional(),
  allModels: z.boolean().optional(),
  samplesPerModel: z.number().int().positive().optional(),
});

export type GenerateBody = z.infer<typeof generateBodySchema>;

const ASPECT_RATIO_TO_SIZE: Record<
  NonNullable<GenerateBody["aspectRatio"]>,
  string
> = {
  square: "1024x1024",
  widescreen: "1536x1024",
  tiktok: "1024x1536",
};

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
}): string {
  const parts: string[] = [];
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
  const config = buildImageGeneratorConfig();
  const provider = config.providers.find((p) => p.id === args.body.provider);
  if (!provider) {
    throw new GenerateValidationError(
      `Provider "${args.body.provider}" is not configured`,
    );
  }

  const samplesPerModel = args.body.allModels
    ? (args.body.samplesPerModel ?? 3)
    : 1;
  if (samplesPerModel > env.SAMPLES_PER_MODEL_MAX) {
    throw new GenerateValidationError(
      `samplesPerModel ${samplesPerModel} exceeds max ${env.SAMPLES_PER_MODEL_MAX}`,
    );
  }

  const models = args.body.allModels
    ? provider.models
    : [args.body.model ?? env.DEFAULT_MODEL];
  if (models.length === 0) {
    throw new GenerateValidationError(
      `Provider "${args.body.provider}" has no configured models`,
    );
  }

  const sizeStr = args.body.aspectRatio
    ? ASPECT_RATIO_TO_SIZE[args.body.aspectRatio]
    : (args.body.size ?? "1024x1024");
  const requested = parseRequestedSize(sizeStr);
  const generation = mapToNearestSupportedSize(requested);

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

  const finalPrompt = buildFinalPrompt({
    prompt: args.body.prompt,
    style: args.body.style,
    camera: args.body.camera,
    aspectRatio: args.body.aspectRatio,
  });

  const rows: GeneratedImageDTO[] = [];
  for (const model of models) {
    for (let i = 0; i < samplesPerModel; i++) {
      const row = await prisma.generatedImage.create({
        data: {
          userId: args.userId,
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
          aspectRatio: args.body.aspectRatio ?? null,
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
