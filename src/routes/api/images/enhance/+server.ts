import { error, json } from "@sveltejs/kit";
import { z } from "zod";
import { requireAuthenticatedApiUser } from "$lib/server/auth-guards";
import { getImageGeneratorEnv } from "$lib/server/env";
import { PromptEnhancer } from "$lib/services/image-providers/enhance.server";
import type { RequestHandler } from "./$types";

const bodySchema = z.object({
  prompt: z.string().min(1, "prompt is required"),
  brandGuidelines: z.string().optional(),
});

export const POST: RequestHandler = async (event) => {
  requireAuthenticatedApiUser(event);

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

  const enhancer = new PromptEnhancer({ apiKey: env.OPENAI_API_KEY });
  const result = await enhancer.enhance(
    parsed.data.prompt,
    parsed.data.brandGuidelines,
  );
  return json(result);
};
