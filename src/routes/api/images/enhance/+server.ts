import { error, json } from "@sveltejs/kit";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { requireAuthenticatedApiUser } from "$lib/server/auth-guards";
import { getImageGeneratorEnv } from "$lib/server/env";
import { prisma } from "$lib/server/prisma";
import { PromptEnhancer } from "$lib/services/image-providers/enhance.server";
import type { RequestHandler } from "./$types";

const bodySchema = z.object({
  prompt: z.string().min(1, "prompt is required"),
  brandGuidelines: z.string().optional(),
  referenceIds: z.array(z.string()).optional(),
  clarifications: z
    .array(
      z.object({
        question: z.string().min(1),
        answer: z.string().min(1),
      }),
    )
    .optional(),
});

export const POST: RequestHandler = async (event) => {
  const { user } = requireAuthenticatedApiUser(event);

  const env = getImageGeneratorEnv();
  if (!env.OPENAI_API_KEY) {
    error(503, "Prompt enhancement is unavailable: OPENAI_API_KEY is not set");
  }

  let raw: unknown;
  try {
    raw = await event.request.json();
  } catch {
    error(400, "Expected JSON body");
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    error(400, parsed.error.issues.map((i) => i.message).join("; "));
  }

  const referenceImages = await loadReferenceImages(
    parsed.data.referenceIds ?? [],
    user.id,
  );

  const enhancer = new PromptEnhancer({ apiKey: env.OPENAI_API_KEY });
  const clarifications = parsed.data.clarifications ?? [];
  const result =
    clarifications.length > 0
      ? await enhancer.enhanceWithClarifications(
          parsed.data.prompt,
          clarifications,
          parsed.data.brandGuidelines,
          referenceImages,
        )
      : await enhancer.enhance(
          parsed.data.prompt,
          parsed.data.brandGuidelines,
          referenceImages,
        );
  return json(result);
};

// Loads the caller's own reference images as base64 data URLs so the enhancer
// can reason about what the attached images already contain. References that
// can't be read are skipped rather than failing the whole request.
async function loadReferenceImages(
  referenceIds: string[],
  userId: string,
): Promise<string[] | undefined> {
  if (referenceIds.length === 0) return undefined;

  const refs = await prisma.referenceImage.findMany({
    where: { id: { in: referenceIds }, userId },
    select: { localPath: true, contentType: true },
  });

  const dataUrls: string[] = [];
  for (const ref of refs) {
    try {
      const bytes = await readFile(ref.localPath);
      const contentType = ref.contentType || "image/png";
      dataUrls.push(`data:${contentType};base64,${bytes.toString("base64")}`);
    } catch {
      // Missing/unreadable file — skip it and enhance with the rest.
    }
  }

  return dataUrls.length > 0 ? dataUrls : undefined;
}
