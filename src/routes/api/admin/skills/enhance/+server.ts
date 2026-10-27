import { requireApiPermission } from "$lib/server/auth-guards";
import { enhanceSkillField } from "$lib/services/skills/skill-enhance.server";
import { error, json } from "@sveltejs/kit";
import { z } from "zod";
import type { RequestHandler } from "./$types";

const bodySchema = z.object({
  field: z.enum(["description", "instructions"]),
  text: z.string().trim().min(1, "Nothing to enhance yet").max(60_000),
  name: z.string().trim().max(64).optional(),
  description: z.string().max(4_000).optional(),
  instructions: z.string().max(60_000).optional(),
});

/**
 * AI rewrite for the skill editor's description / instructions fields.
 * `/api/admin/*` is outside the `/admin` hooks gate, so the permission check
 * here is the only protection.
 */
export const POST: RequestHandler = async (event) => {
  await requireApiPermission(event, { skill: ["manage"] });

  const body = await event.request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    error(400, parsed.error.issues[0]?.message ?? "Invalid request");
  }

  try {
    return json({ text: await enhanceSkillField(parsed.data) });
  } catch (cause) {
    console.error("[skills] enhance failed", cause);
    error(502, cause instanceof Error ? cause.message : "Enhancement failed");
  }
};
