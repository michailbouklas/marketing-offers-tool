import { json } from "@sveltejs/kit";
import {
  externalErrorResponse,
  requireExternalKey,
} from "$lib/server/external-auth";
import type { RequestHandler } from "./$types";

/**
 * OpenAI-compatible model discovery for Open WebUI's connection check. Only a
 * valid key is required — no user identity is involved, so the email header
 * may be absent here. Exposes the single bridged agent as a "model".
 */

/** Stable so clients that diff the model list do not see churn. */
const CREATED_AT = 1_756_000_000;

export const GET: RequestHandler = async ({ request }) => {
  try {
    requireExternalKey(request);

    return json({
      object: "list",
      data: [
        {
          id: "sales-agent",
          object: "model",
          created: CREATED_AT,
          owned_by: "marketing-offers-tool",
        },
      ],
    });
  } catch (err) {
    return externalErrorResponse(err);
  }
};
