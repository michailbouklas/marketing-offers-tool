import { error, json } from "@sveltejs/kit";
import { z } from "zod";
import { requireApiPermission } from "$lib/server/auth-guards";
import {
  CopyFeedbackError,
  updateVariantFeedback,
} from "$lib/services/copywriter/copywriter.server";
import type { RequestHandler } from "./$types";

const feedbackBodySchema = z.object({
  variantIndex: z.number().int().min(0),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  picked: z.boolean().optional(),
});

export const PATCH: RequestHandler = async (event) => {
  const { user } = await requireApiPermission(event, {
    copywriter: ["generate"],
  });

  let raw: unknown;
  try {
    raw = await event.request.json();
  } catch {
    error(400, "Expected JSON body");
  }

  const parsed = feedbackBodySchema.safeParse(raw);
  if (!parsed.success) {
    error(400, parsed.error.issues.map((i) => i.message).join("; "));
  }

  try {
    const item = await updateVariantFeedback({
      userId: user.id,
      generatedCopyId: event.params.id,
      variantIndex: parsed.data.variantIndex,
      rating: parsed.data.rating,
      picked: parsed.data.picked,
    });
    return json({ item });
  } catch (e) {
    if (e instanceof CopyFeedbackError) {
      error(e.status, e.message);
    }
    throw e;
  }
};
