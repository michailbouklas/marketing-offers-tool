import type { MastraModelOutput } from "@mastra/core/stream";
import {
  authenticateExternalUser,
  ExternalApiError,
  externalErrorResponse,
  requireExternalBearer,
} from "$lib/server/external-auth";
import { getMastra } from "$lib/server/mastra";
import { chatAgents } from "$lib/server/mastra/chat-registry";
import {
  chatCompletionRequestSchema,
  newCompletionId,
  openAIJsonResponse,
  openAIStreamResponse,
  toModelMessages,
  type CompletionEnvelope,
} from "$lib/server/openai-compat";
import type { RequestHandler } from "./$types";

/**
 * OpenAI-compatible `POST /chat/completions` in front of the Mastra
 * `sales-agent`, for Open WebUI's "OpenAI API" connection type.
 *
 * Flow: bearer secret → body validation → resolve the acting user from the
 * forwarded email header (permission + brand scope) → run the agent →
 * encode as OpenAI SSE chunks or a `chat.completion` JSON body.
 *
 * Open WebUI also calls the selected model for housekeeping (chat title,
 * tags, follow-up suggestions). Those arrive with the task header set and
 * are answered by a cheap tool-less model call so they never touch the
 * warehouse.
 */

const MODEL_ID = "sales-agent";

/** Same lightweight model memory.ts uses for thread titles. */
const TASK_MODEL = "openai/gpt-4o-mini";

const TASK_INSTRUCTIONS =
  "You complete short housekeeping tasks for a chat UI (titles, tags, " +
  "follow-up suggestions, search queries). Follow the formatting " +
  "instructions in the user message exactly and output nothing else. " +
  "You have no tools and must not attempt to call any.";

/** Open WebUI chat ids are UUIDs; anything else falls back to stateless mode. */
const CHAT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function respond(
  stream: boolean,
  envelope: CompletionEnvelope,
  output: MastraModelOutput,
  abort: AbortController,
) {
  return stream
    ? openAIStreamResponse({ ...envelope, output, abort })
    : openAIJsonResponse({ ...envelope, output });
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    requireExternalBearer(request);

    const parsed = chatCompletionRequestSchema.safeParse(
      await request.json().catch(() => null),
    );

    if (!parsed.success) {
      throw new ExternalApiError(
        400,
        "invalid_body",
        "Invalid chat completion request body.",
      );
    }

    if (parsed.data.model !== MODEL_ID) {
      throw new ExternalApiError(
        404,
        "model_not_found",
        `Unknown model "${parsed.data.model}". Available: ${MODEL_ID}.`,
      );
    }

    const caller = await authenticateExternalUser(request, {
      permissions: chatAgents[MODEL_ID]?.permissions ?? { sales: ["view"] },
      channel: "openwebui",
    });

    const { messages, lastUser } = toModelMessages(parsed.data.messages);
    const agent = getMastra().getAgentById(MODEL_ID);

    const abort = new AbortController();
    request.signal.addEventListener("abort", () => abort.abort(), {
      once: true,
    });

    const envelope: CompletionEnvelope = {
      id: newCompletionId(),
      model: MODEL_ID,
      created: Math.floor(Date.now() / 1000),
    };

    // Housekeeping tasks: cheap model, no tools, no memory — Open WebUI
    // expects a small JSON answer, not a sales analysis.
    if (caller.headers.task) {
      const output = await agent.stream(messages, {
        model: TASK_MODEL,
        instructions: TASK_INSTRUCTIONS,
        maxSteps: 1,
        toolChoice: "none",
        activeTools: [],
        requestContext: caller.requestContext,
        abortSignal: abort.signal,
      });

      return await respond(parsed.data.stream, envelope, output, abort);
    }

    // Memory: when Open WebUI forwards its chat id, keep one Mastra thread per
    // Open WebUI chat and send only the new user turn (Open WebUI resends the
    // whole history — with memory on, passing it too would duplicate every
    // turn). Without a chat id the request is stateless: full history in,
    // nothing persisted. The `openwebui:` prefix keeps these threads out of
    // the in-app widget's history list (it filters on `sales-agent:<user>:`).
    const chatId =
      caller.headers.chatId && CHAT_ID_PATTERN.test(caller.headers.chatId)
        ? caller.headers.chatId
        : null;
    const memory = chatId
      ? {
          thread: `openwebui:${caller.user.id}:${chatId}`,
          resource: caller.user.id,
        }
      : undefined;

    const output = await agent.stream(memory ? [lastUser] : messages, {
      requestContext: caller.requestContext,
      maxSteps: 8,
      // Hard guard for this channel: file-producing tools are absent, so the
      // model cannot emit download links Open WebUI users cannot open.
      activeTools: ["querySalesSql"],
      abortSignal: abort.signal,
      ...(memory ? { memory } : {}),
    });

    return await respond(parsed.data.stream, envelope, output, abort);
  } catch (err) {
    return externalErrorResponse(err);
  }
};
