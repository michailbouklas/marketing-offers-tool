import { json } from "@sveltejs/kit";
import { requireAdminUser } from "$lib/server/auth-guards";
import {
  approveGapSubmission,
  rejectGapSubmission,
} from "$lib/services/offers-data-quality.server";
import {
  bulkPendingSubmissionDecisionSchema,
  type BulkPendingSubmissionDecisionResult,
} from "$lib/services/offers-data-quality";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async (event) => {
  const { user } = await requireAdminUser(event);

  let requestBody: unknown;

  try {
    requestBody = await event.request.json();
  } catch {
    return json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const payloadResult =
    bulkPendingSubmissionDecisionSchema.safeParse(requestBody);

  if (!payloadResult.success) {
    return json(
      { error: "Select at least one valid submission." },
      { status: 400 },
    );
  }

  const uniqueIds = [...new Set(payloadResult.data.ids)];
  const result: BulkPendingSubmissionDecisionResult = {
    decision: payloadResult.data.decision,
    processedIds: [],
    failed: [],
  };

  for (const stagingId of uniqueIds) {
    try {
      const record =
        payloadResult.data.decision === "approve"
          ? await approveGapSubmission(stagingId, user.id)
          : await rejectGapSubmission(stagingId);

      if (!record) {
        result.failed.push({
          id: stagingId,
          error: "Submission not found",
        });
        continue;
      }

      result.processedIds.push(stagingId);
    } catch (error) {
      result.failed.push({
        id: stagingId,
        error:
          error instanceof Error
            ? error.message
            : `Unable to ${payloadResult.data.decision} submission`,
      });
    }
  }

  return json(result, {
    status: result.failed.length > 0 ? 207 : 200,
  });
};
