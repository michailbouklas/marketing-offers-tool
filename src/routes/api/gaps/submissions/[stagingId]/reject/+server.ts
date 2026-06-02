import { json } from "@sveltejs/kit";
import { requireApiAdminPermission } from "$lib/server/auth-guards";
import { rejectGapSubmission } from "$lib/services/offers-data-quality.server";
import { z } from "zod";
import type { RequestHandler } from "./$types";

const paramsSchema = z.object({
  stagingId: z.coerce.number().int().positive(),
});

export const POST: RequestHandler = async (event) => {
  await requireApiAdminPermission(event, { submission: ["reject"] });

  const paramsResult = paramsSchema.safeParse(event.params);

  if (!paramsResult.success) {
    return json({ error: "A valid staging id is required" }, { status: 400 });
  }

  try {
    const record = await rejectGapSubmission(paramsResult.data.stagingId);

    if (!record) {
      return json({ error: "Submission not found" }, { status: 404 });
    }

    return json({
      staging_id: record.id,
      status: "rejected",
    });
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Rejection failed — please try again.",
      },
      { status: 409 },
    );
  }
};
