import { error, json } from "@sveltejs/kit";
import { requireAuthenticatedApiUser } from "$lib/server/auth-guards";
import {
  GenerateValidationError,
  createPendingGenerations,
  generateBodySchema,
} from "$lib/services/image-generator/generate.server";
import { kickoffPendingGenerations } from "$lib/services/image-generator/orchestrate.server";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async (event) => {
  const { user } = requireAuthenticatedApiUser(event);

  let raw: unknown;
  try {
    raw = await event.request.json();
  } catch {
    error(400, "Expected JSON body");
  }

  const parsed = generateBodySchema.safeParse(raw);
  if (!parsed.success) {
    error(400, parsed.error.issues.map((i) => i.message).join("; "));
  }

  try {
    const items = await createPendingGenerations({
      userId: user.id,
      body: parsed.data,
    });
    kickoffPendingGenerations(
      items.map((item) => item.id),
      parsed.data.outputFormat ?? "png",
    );
    return json({ items });
  } catch (e) {
    if (e instanceof GenerateValidationError) {
      error(e.status, e.message);
    }
    throw e;
  }
};
