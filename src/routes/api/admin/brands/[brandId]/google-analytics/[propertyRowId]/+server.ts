import { json } from "@sveltejs/kit";
import { z } from "zod";
import {
  deleteProperty,
  updateProperty,
} from "$lib/services/google-analytics/properties.server";
import type { RequestHandler } from "./$types";
import {
  brandOr404,
  parseBrandId,
  propertyOr404,
  readJsonBody,
  requireGoogleAnalyticsAdmin,
  throwForServiceError,
} from "../shared.server";

const patchBodySchema = z
  .object({
    displayName: z.string().trim().min(1).max(120).optional(),
    active: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
    /** Replaces the stored service-account key when present. */
    credentialsJson: z.string().min(2).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Nothing to update",
  });

export const PATCH: RequestHandler = async (event) => {
  await requireGoogleAnalyticsAdmin(event);
  const brandId = parseBrandId(event.params.brandId);
  await brandOr404(brandId);
  const existing = await propertyOr404(brandId, event.params.propertyRowId);

  const parsed = patchBodySchema.safeParse(await readJsonBody(event));
  if (!parsed.success) {
    return json(
      { message: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 },
    );
  }

  try {
    const property = await updateProperty(existing.id, parsed.data);
    return json({ property });
  } catch (err) {
    throwForServiceError(err);
  }
};

export const DELETE: RequestHandler = async (event) => {
  await requireGoogleAnalyticsAdmin(event);
  const brandId = parseBrandId(event.params.brandId);
  await brandOr404(brandId);
  const existing = await propertyOr404(brandId, event.params.propertyRowId);

  await deleteProperty(existing.id);

  return new Response(null, { status: 204 });
};
