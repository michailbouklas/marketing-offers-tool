import { json } from "@sveltejs/kit";
import { z } from "zod";
import { preflight, withCors } from "$lib/server/cors";
import { getOpenWebUiEnv } from "$lib/server/env";
import {
  authenticateExternalUser,
  ExternalApiError,
} from "$lib/server/external-auth";
import { getMastra } from "$lib/server/mastra";
import { chatAgents } from "$lib/server/mastra/chat-registry";
import type { RequestHandler } from "./$types";

/**
 * The single operation of the Open WebUI tool server: answer one sales
 * question with the Mastra `sales-agent` and return the text for Open WebUI's
 * own model to relay. Tool results are not streamed by Open WebUI, so this is
 * a plain request/response with a wall-clock budget.
 */

const AGENT_ID = "sales-agent";

/** Open WebUI chat ids are UUIDs; anything else falls back to stateless mode. */
const CHAT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

const FALLBACK_ANSWER =
  "I could not complete the analysis within the step limit. Please ask a " +
  "narrower question (fewer brands, a shorter period, or one metric).";

const requestSchema = z.object({
  question: z.string().trim().min(1).max(4000),
  conversation_context: z.string().trim().max(8000).optional(),
});

export const OPTIONS: RequestHandler = (event) => preflight(event);

export const POST: RequestHandler = withCors(async (event) => {
  // Authenticate before touching the body so unauthenticated callers learn
  // nothing about validation.
  const caller = await authenticateExternalUser(event.request, {
    permissions: chatAgents[AGENT_ID]?.permissions ?? { sales: ["view"] },
    channel: "openwebui",
  });

  const parsed = requestSchema.safeParse(
    await event.request.json().catch(() => null),
  );

  if (!parsed.success) {
    throw new ExternalApiError(
      400,
      "invalid_body",
      "Body must be { question: string, conversation_context?: string }.",
    );
  }

  const prompt = parsed.data.conversation_context
    ? `Earlier conversation (context only):\n${parsed.data.conversation_context}\n\nQuestion: ${parsed.data.question}`
    : parsed.data.question;

  // Thread continuity when Open WebUI (global registration) forwards its chat
  // id; otherwise stateless — conversation_context covers follow-ups.
  const chatId =
    caller.headers.chatId && CHAT_ID_PATTERN.test(caller.headers.chatId)
      ? caller.headers.chatId
      : null;
  const memory = chatId
    ? {
        thread: `openwebui-tool:${caller.user.id}:${chatId}`,
        resource: caller.user.id,
      }
    : undefined;

  const agent = getMastra().getAgentById(AGENT_ID);
  const timeoutMs = getOpenWebUiEnv().OPENWEBUI_ASK_TIMEOUT_MS;

  let result;

  try {
    result = await agent.generate(prompt, {
      requestContext: caller.requestContext,
      maxSteps: 8,
      // File-producing tools are absent in this channel: Open WebUI users
      // cannot open the app's authenticated download links.
      activeTools: ["querySalesSql"],
      abortSignal: AbortSignal.timeout(timeoutMs),
      modelSettings: { maxRetries: 1 },
      ...(memory ? { memory } : {}),
    });
  } catch (cause) {
    const name = cause instanceof Error ? cause.name : "";

    if (name === "TimeoutError" || name === "AbortError") {
      throw new ExternalApiError(
        504,
        "timeout",
        "The sales assistant took too long to answer. Ask a narrower question.",
      );
    }

    throw cause;
  }

  if (result.error) {
    console.error("[openwebui-tools] agent error", result.error);
    throw new ExternalApiError(
      502,
      "agent_error",
      "The sales assistant failed to answer. Please try again.",
    );
  }

  return json({
    answer: result.text.trim() || FALLBACK_ANSWER,
    brands_in_scope: caller.brands.map((brand) => brand.name),
  });
});
