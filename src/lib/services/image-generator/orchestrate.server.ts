import { getImageGeneratorEnv } from "$lib/server/env";
import { writeImageBytes } from "$lib/server/image-storage";
import { resizeToRequested } from "$lib/server/image-size";
import { prisma } from "$lib/server/prisma";
import { getImageProvider } from "$lib/services/image-providers/factory.server";

export async function generateOneRow(rowId: string): Promise<void> {
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
    const output = await provider.generateImage({
      prompt: row.finalPrompt,
      width: row.generationWidth,
      height: row.generationHeight,
      model: row.model ?? undefined,
      references: references.length > 0 ? references : undefined,
    });

    const normalized = await resizeToRequested(output.bytes, {
      width: row.requestedWidth,
      height: row.requestedHeight,
    });

    const env = getImageGeneratorEnv();
    const localPath = await writeImageBytes(
      env.UPLOADS_DIR,
      row.id,
      normalized,
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

export function kickoffPendingGenerations(rowIds: string[]): void {
  for (const id of rowIds) {
    setImmediate(() => {
      void generateOneRow(id);
    });
  }
}
