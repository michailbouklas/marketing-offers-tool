import { json } from "@sveltejs/kit";
import {
  describeGoogleAnalyticsError,
  verifyPropertyAccess,
} from "$lib/services/google-analytics/ga4-client.server";
import {
  getDecryptedCredentials,
  recordVerification,
} from "$lib/services/google-analytics/properties.server";
import type { RequestHandler } from "./$types";
import {
  brandOr404,
  parseBrandId,
  propertyOr404,
  requireGoogleAnalyticsAdmin,
} from "../../shared.server";

export type VerifyGoogleAnalyticsPropertyResponse = {
  ok: boolean;
  error: string | null;
  verifiedAt: string | null;
};

/**
 * "Test connection": runs a one-metric report against the property with the
 * stored key and records the outcome on the row. Always answers 200 with
 * `{ ok, error }` so the UI can show Google's explanation.
 */
export const POST: RequestHandler = async (event) => {
  await requireGoogleAnalyticsAdmin(event);
  const brandId = parseBrandId(event.params.brandId);
  await brandOr404(brandId);
  const property = await propertyOr404(brandId, event.params.propertyRowId);

  try {
    const { propertyId, credentials } = await getDecryptedCredentials(
      property.id,
    );
    await verifyPropertyAccess(propertyId, credentials);
    await recordVerification(property.id, { ok: true });

    return json({
      ok: true,
      error: null,
      verifiedAt: new Date().toISOString(),
    } satisfies VerifyGoogleAnalyticsPropertyResponse);
  } catch (err) {
    const message = describeGoogleAnalyticsError(err);
    await recordVerification(property.id, { ok: false, error: message });

    return json({
      ok: false,
      error: message,
      verifiedAt: null,
    } satisfies VerifyGoogleAnalyticsPropertyResponse);
  }
};
