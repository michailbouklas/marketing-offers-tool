import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeImageBytes } from "$lib/server/image-storage";
import { resizeToRequested } from "$lib/server/image-size";
import { getObjectStore } from "$lib/server/object-store.server";
import { prisma } from "$lib/server/prisma";
import type { GeneratedImage, Prisma } from "../../../generated/prisma/client";
import { getImageProvider } from "$lib/services/image-providers/factory.server";
import {
  isProviderRequestError,
  type GenerateInput,
  type GenerateOutput,
  type ImageBackground,
  type ImageProvider,
  type ImageQuality,
  type InputFidelity,
} from "$lib/services/image-providers/types";

export type OutputFormat = "png" | "jpg";

// One retry before giving up: providers occasionally return transient 5xx /
// network errors, and re-marking the whole row as failed wastes a generation.
const PROVIDER_ATTEMPTS = 2;

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

/**
 * Persists one failed provider attempt for later investigation. Best-effort:
 * a logging failure must never mask the original provider error.
 */
async function recordFailureLog(args: {
  row: GeneratedImage;
  attempt: number;
  err: unknown;
  durationMs: number;
}): Promise<void> {
  const { row, attempt, err, durationMs } = args;
  const details = isProviderRequestError(err)
    ? {
        responseStatus: err.status,
        responseBody: toJsonValue(err.body),
        requestSnapshot: toJsonValue(err.requestSnapshot),
      }
    : {};
  try {
    await prisma.generationFailureLog.create({
      data: {
        generatedImageId: row.id,
        provider: row.provider,
        model: row.model,
        attempt,
        errorName: err instanceof Error ? err.name : "UnknownError",
        errorMessage: err instanceof Error ? err.message : String(err),
        durationMs,
        ...details,
      },
    });
  } catch (logErr) {
    console.error(
      "[image-generator] Failed to record generation failure log",
      row.id,
      logErr,
    );
  }
}

/**
 * Runs the provider with retries, persisting a failure log row for every
 * failed attempt — including attempts that later succeed on retry.
 */
async function generateWithFailureLogging(
  provider: ImageProvider,
  input: GenerateInput,
  row: GeneratedImage,
): Promise<GenerateOutput> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= PROVIDER_ATTEMPTS; attempt++) {
    const attemptStart = Date.now();
    try {
      return await provider.generateImage(input);
    } catch (err) {
      lastError = err;
      await recordFailureLog({
        row,
        attempt,
        err,
        durationMs: Date.now() - attemptStart,
      });
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

  const store = getObjectStore();
  let row: Awaited<ReturnType<typeof prisma.generatedImage.findUnique>> | null =
    null;
  // Providers read reference images from local file paths, so when the active
  // object store is remote (Supabase) we materialize each reference into a
  // throwaway temp directory and hand the provider those paths.
  let tempRefDir: string | null = null;
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
        select: { id: true, localPath: true },
      });
      tempRefDir = await mkdtemp(join(tmpdir(), "img-refs-"));
      references = [];
      for (const ref of refs) {
        const bytes = await store.get(ref.localPath);
        // Preserve the extension from the key so the provider can infer the
        // content type and filename correctly.
        const ext = ref.localPath.split(".").pop() ?? "png";
        const refPath = join(tempRefDir, `${ref.id}.${ext}`);
        await writeFile(refPath, bytes);
        references.push(refPath);
      }
    }

    const provider = getImageProvider(row.provider);
    const quality = isImageQuality(row.quality) ? row.quality : undefined;
    const background = isImageBackground(row.background)
      ? row.background
      : undefined;
    const inputFidelity = isInputFidelity(row.inputFidelity)
      ? row.inputFidelity
      : undefined;
    const output = await generateWithFailureLogging(
      provider,
      {
        prompt: row.finalPrompt,
        width: row.generationWidth,
        height: row.generationHeight,
        model: row.model ?? undefined,
        references: references.length > 0 ? references : undefined,
        quality,
        background,
        inputFidelity,
      },
      row,
    );

    const normalized = await resizeToRequested(output.bytes, {
      width: row.requestedWidth,
      height: row.requestedHeight,
      format: outputFormat,
    });

    const localPath = await writeImageBytes(
      store,
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
  } finally {
    if (tempRefDir) {
      await rm(tempRefDir, { recursive: true, force: true }).catch(() => {});
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
