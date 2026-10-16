import { json } from "@sveltejs/kit";
import { z } from "zod";
import {
  createProperty,
  listPropertiesForBrandAdmin,
} from "$lib/services/google-analytics/properties.server";
import type { RequestHandler } from "./$types";
import {
  brandOr404,
  parseBrandId,
  readJsonBody,
  requireGoogleAnalyticsAdmin,
  throwForServiceError,
} from "./shared.server";

/**
 * GA4 properties linked to a brand. The response never contains the stored
 * service-account key — only its client email / key id for display.
 */
const createBodySchema = z.object({
  propertyId: z.string().trim().min(1, "GA4 property id is required"),
  displayName: z.string().trim().min(1, "Display name is required").max(120),
  credentialsJson: z.string().min(2, "Service-account JSON is required"),
});

export const GET: RequestHandler = async (event) => {
  await requireGoogleAnalyticsAdmin(event);
  const brandId = parseBrandId(event.params.brandId);
  await brandOr404(brandId);

  return json({ properties: await listPropertiesForBrandAdmin(brandId) });
};

export const POST: RequestHandler = async (event) => {
  const { user } = await requireGoogleAnalyticsAdmin(event);
  const brandId = parseBrandId(event.params.brandId);
  await brandOr404(brandId);

  const parsed = createBodySchema.safeParse(await readJsonBody(event));
  if (!parsed.success) {
    return json(
      { message: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 },
    );
  }

  try {
    const property = await createProperty({
      brandId,
      propertyId: parsed.data.propertyId,
      displayName: parsed.data.displayName,
      credentialsJson: parsed.data.credentialsJson,
      createdBy: user.id,
    });

    return json({ property }, { status: 201 });
  } catch (err) {
    throwForServiceError(err);
  }
};
