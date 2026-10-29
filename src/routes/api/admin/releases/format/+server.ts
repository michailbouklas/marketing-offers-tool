import { error, json } from "@sveltejs/kit";
import { z } from "zod";
import { requireApiAdminPermission } from "$lib/server/auth-guards";
import {
  RELEASE_BODY_MAX_LENGTH,
  RELEASE_TITLE_MAX_LENGTH,
} from "$lib/services/releases/release-form";
import { formatReleaseBody } from "$lib/services/releases/release-format.server";
import type { RequestHandler } from "./$types";

const bodySchema = z.object({
  title: z.string().trim().max(RELEASE_TITLE_MAX_LENGTH).optional(),
  body: z
    .string()
    .trim()
    .min(1, "Nothing to format yet")
    .max(RELEASE_BODY_MAX_LENGTH),
});

/**
 * AI format pass for the release form's markdown body. superUser only
 * (`release: ["manage"]`); `/api/admin/*` is outside the `/admin` hooks gate,
 * so this check is the only protection.
 */
export const POST: RequestHandler = async (event) => {
  await requireApiAdminPermission(event, { release: ["manage"] });

  const body = await event.request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    error(400, parsed.error.issues[0]?.message ?? "Invalid request");
  }

  try {
    return json({ text: await formatReleaseBody(parsed.data) });
  } catch (cause) {
    console.error("[releases] format failed", cause);
    error(502, cause instanceof Error ? cause.message : "Formatting failed");
  }
};
