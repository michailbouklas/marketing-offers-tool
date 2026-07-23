import { json } from "@sveltejs/kit";
import { requireApiPermission } from "$lib/server/auth-guards";
import { approveGapSubmission } from "$lib/services/offers-data-quality.server";
import { z } from "zod";
import type { RequestHandler } from "./$types";

const paramsSchema = z.object({
  stagingId: z.coerce.number().int().positive(),
});

export const POST: RequestHandler = async (event) => {
  const { user } = await requireApiPermission(event, {
    submission: ["approve"],
  });
  const paramsResult = paramsSchema.safeParse(event.params);

  if (!paramsResult.success) {
    return json({ error: "A valid staging id is required" }, { status: 400 });
  }

  try {
    const record = await approveGapSubmission(
      paramsResult.data.stagingId,
      user?.id ?? "",
    );

    if (!record) {
      return json({ error: "Submission not found" }, { status: 404 });
    }

    return json({
      staging_id: record.id,
      status: "approved",
      approved_at: new Date().toISOString(),
    });
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Approval failed — please try again.",
      },
      { status: 409 },
    );
  }
};
