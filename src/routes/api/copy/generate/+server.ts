import { error, json } from "@sveltejs/kit";
import { requireApiPermission } from "$lib/server/auth-guards";
import {
  CopyGenerateValidationError,
  generateCopy,
  generateCopyBodySchema,
} from "$lib/services/copywriter/generate.server";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async (event) => {
  const { user } = await requireApiPermission(event, {
    copywriter: ["generate"],
  });

  let raw: unknown;
  try {
    raw = await event.request.json();
  } catch {
    error(400, "Expected JSON body");
  }

  const parsed = generateCopyBodySchema.safeParse(raw);
  if (!parsed.success) {
    error(400, parsed.error.issues.map((i) => i.message).join("; "));
  }

  try {
    const item = await generateCopy({
      userId: user.id,
      body: parsed.data,
    });
    return json({ item });
  } catch (e) {
    if (e instanceof CopyGenerateValidationError) {
      error(e.status, e.message);
    }
    throw e;
  }
};
