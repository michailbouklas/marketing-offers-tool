import { getImageGeneratorEnv } from "$lib/server/env";
import { writeImageBytes } from "$lib/server/image-storage";
import { resizeToRequested } from "$lib/server/image-size";
import { prisma } from "$lib/server/prisma";
import { getImageProvider } from "$lib/services/image-providers/factory.server";
import type {
  ImageBackground,
  ImageQuality,
  InputFidelity,
} from "$lib/services/image-providers/types";

export type OutputFormat = "png" | "jpg";

// One retry before giving up: providers occasionally return transient 5xx /
// network errors, and re-marking the whole row as failed wastes a generation.
async function withRetry<T>(fn: () => Promise<T>, attempts = 2): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

function isImageQuality(value: unknown): value is ImageQuality {
  return (
    value === "auto" ||
    value === "low" ||
    value === "medium" ||
    value === "high"
  );
}

function isImageBackground(value: unknown): value is ImageBackground {
  return value === "auto" || value === "opaque" || value === "transparent";
}

function isInputFidelity(value: unknown): value is InputFidelity {
  return value === "high" || value === "low";
}

export async function generateOneRow(
  rowId: string,
  outputFormat: OutputFormat = "png",
): Promise<void> {
  const start = Date.now();

  let row: Awaited<ReturnType<typeof prisma.generatedImage.findUnique>> | null =
    null;
  try {
    row = await prisma.generatedImage.findUnique({ where: { id: rowId } });
    if (!row) {
      return;
    }
    if (row.status !== "pending") {
      return;
    }

    const referenceIds = Array.isArray(row.referenceIds)
      ? row.referenceIds.filter((v): v is string => typeof v === "string")
      : [];

    let references: string[] = [];
    if (referenceIds.length > 0) {
      const refs = await prisma.referenceImage.findMany({
        where: { id: { in: referenceIds }, userId: row.userId },
        select: { localPath: true },
      });
      references = refs.map((r) => r.localPath);
    }

    const provider = getImageProvider(row.provider);
    const quality = isImageQuality(row.quality) ? row.quality : undefined;
    const background = isImageBackground(row.background)
      ? row.background
      : undefined;
    const inputFidelity = isInputFidelity(row.inputFidelity)
      ? row.inputFidelity
      : undefined;
    const output = await withRetry(() =>
      provider.generateImage({
        prompt: row!.finalPrompt,
        width: row!.generationWidth,
        height: row!.generationHeight,
        model: row!.model ?? undefined,
        references: references.length > 0 ? references : undefined,
        quality,
        background,
        inputFidelity,
      }),
    );

    const normalized = await resizeToRequested(output.bytes, {
      width: row.requestedWidth,
      height: row.requestedHeight,
      format: outputFormat,
    });

    const env = getImageGeneratorEnv();
    const localPath = await writeImageBytes(
      env.UPLOADS_DIR,
      row.id,
      normalized,
      outputFormat,
    );

    await prisma.generatedImage.update({
      where: { id: row.id },
      data: {
        status: "completed",
        localPath,
        durationMs: Date.now() - start,
      },
    });
  } catch (err) {
    if (!row) {
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    try {
      await prisma.generatedImage.update({
        where: { id: row.id },
        data: {
          status: "failed",
          errorMessage: message,
          durationMs: Date.now() - start,
        },
      });
    } catch (updateErr) {
      console.error(
        "[image-generator] Failed to mark row as failed",
        row.id,
        updateErr,
      );
    }
  }
}

export function kickoffPendingGenerations(
  rowIds: string[],
  outputFormat: OutputFormat = "png",
): void {
  for (const id of rowIds) {
    setImmediate(() => {
      void generateOneRow(id, outputFormat);
    });
  }
}
