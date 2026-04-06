import { json } from "@sveltejs/kit";
import { requireAuthenticatedUser } from "$lib/server/auth-guards";
import { gapRouteParamsSchema } from "$lib/services/offers-data-quality";
import { getGapFormData } from "$lib/services/offers-data-quality.server";
import {
  createDimOffersStagingRecord,
  getGapRecordById,
  getPendingStagingRecordByGapId,
  updateGapRecordStatus,
  validateCategorySubcategoryPair,
} from "$lib/services/offers-data-quality-postgres.server";
import {
  formatFractionalDecimal,
  formatPricingDecimal,
  getZodFieldErrors,
  submitGapPricingSchema,
} from "$lib/services/offers-data-quality";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async (event) => {
  requireAuthenticatedUser(event);

  const parseResult = gapRouteParamsSchema.safeParse(event.params);

  if (!parseResult.success) {
    return json(
      {
        error: "A valid gap id is required",
      },
      { status: 400 },
    );
  }

  try {
    const data = await getGapFormData(parseResult.data.id);

    if (!data) {
      return json(
        {
          error: "Gap not found",
        },
        { status: 404 },
      );
    }

    return json(data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load gap form data";

    return json(
      {
        error: message,
      },
      { status: 500 },
    );
  }
};

export const POST: RequestHandler = async (event) => {
  const { user } = requireAuthenticatedUser(event);

  const parseResult = gapRouteParamsSchema.safeParse(event.params);

  if (!parseResult.success) {
    return json(
      {
        error: "A valid gap id is required",
      },
      { status: 400 },
    );
  }

  let requestBody: unknown;

  try {
    requestBody = await event.request.json();
  } catch {
    return json(
      {
        error: "Request body must be valid JSON",
      },
      { status: 400 },
    );
  }

  const payloadResult = submitGapPricingSchema.safeParse(requestBody);

  if (!payloadResult.success) {
    return json(
      {
        errors: getZodFieldErrors(payloadResult.error),
      },
      { status: 400 },
    );
  }

  const gapRecord = await getGapRecordById(parseResult.data.id);

  if (!gapRecord) {
    return json(
      {
        error: "Gap not found",
      },
      { status: 404 },
    );
  }

  if (gapRecord.status !== "open") {
    return json(
      {
        error: "Gap is not open for submission",
      },
      { status: 409 },
    );
  }

  const existingPendingRecord = await getPendingStagingRecordByGapId(
    gapRecord.dq_id,
  );

  if (existingPendingRecord) {
    return json(
      {
        error: "Gap already has a pending submission",
      },
      { status: 409 },
    );
  }

  const categorySubcategoryIsValid = await validateCategorySubcategoryPair(
    payloadResult.data.category,
    payloadResult.data.subcategory,
  );

  if (!categorySubcategoryIsValid) {
    return json(
      {
        errors: {
          subcategory: "Invalid subcategory for the selected category",
        },
      },
      { status: 400 },
    );
  }

  const stagingRecord = await createDimOffersStagingRecord({
    dq_id: gapRecord.dq_id,
    item_code: gapRecord.trde_item,
    channel: payloadResult.data.channel,
    category: payloadResult.data.category,
    subcategory: payloadResult.data.subcategory,
    ideal_price: formatPricingDecimal(payloadResult.data.ideal_price)!,
    selling_price: formatPricingDecimal(payloadResult.data.selling_price)!,
    fc_perc: formatFractionalDecimal(payloadResult.data.fc_perc),
    mktg_spend: formatPricingDecimal(payloadResult.data.mktg_spend),
    notes: payloadResult.data.notes || null,
    submitted_by: user?.id ?? "",
  });

  await updateGapRecordStatus(gapRecord.dq_id, "submitted");

  return json(
    {
      staging_id: stagingRecord.id,
      status: "pending",
      submitted_at: stagingRecord.submitted_at.toISOString(),
    },
    { status: 201 },
  );
};
