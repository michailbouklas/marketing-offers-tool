import { error, json } from "@sveltejs/kit";
import { z } from "zod";
import { requireAuthenticatedApiUser } from "$lib/server/auth-guards";
import { getImageGeneratorEnv } from "$lib/server/env";
import { StructuredPromptSuggester } from "$lib/services/image-providers/structured-prompt.server";
import type { RequestHandler } from "./$types";

const bodySchema = z.object({
  description: z.string().min(1, "description is required"),
  brandGuidelines: z.string().optional(),
});

export const POST: RequestHandler = async (event) => {
  requireAuthenticatedApiUser(event);

  const env = getImageGeneratorEnv();
  if (!env.OPENAI_API_KEY) {
    error(503, "Prompt suggestions are unavailable: OPENAI_API_KEY is not set");
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

  const suggester = new StructuredPromptSuggester({
    apiKey: env.OPENAI_API_KEY,
  });
  const result = await suggester.suggest(
    parsed.data.description,
    parsed.data.brandGuidelines,
  );
  return json(result);
};
