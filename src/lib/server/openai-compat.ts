import { randomBytes } from "node:crypto";
import { json } from "@sveltejs/kit";
import type { ChunkType, MastraModelOutput } from "@mastra/core/stream";
import { z } from "zod";
import { ExternalApiError } from "$lib/server/external-api-error";

/**
 * OpenAI Chat Completions wire format on top of a Mastra agent run — request
 * validation, message normalisation, and the streaming (SSE) / JSON response
 * encoders consumed by `/api/openai/v1/chat/completions`.
 */

// ---------------------------------------------------------------------------
// Request schema
// ---------------------------------------------------------------------------

const contentPartSchema = z
  .object({ type: z.string(), text: z.string().optional() })
  .loose();

export const chatMessageSchema = z
  .object({
    role: z.enum(["system", "user", "assistant"]),
    content: z.union([z.string(), z.array(contentPartSchema), z.null()]),
  })
  .loose();

/**
 * Only the fields the bridge acts on are typed; everything else OpenAI clients
 * send (temperature, max_tokens, user, …) is accepted and ignored — the agent
 * is tuned server-side.
 */
export const chatCompletionRequestSchema = z
  .object({
    model: z.string().min(1),
    messages: z.array(chatMessageSchema).min(1),
    stream: z.boolean().default(false),
  })
  .loose();

export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type ChatCompletionRequest = z.infer<typeof chatCompletionRequestSchema>;

/**
 * Discriminated on `role` (not a single object with a union role) so the
 * array is assignable to Mastra's `MessageListInput`.
 */
export type ModelMessageInput =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string };

/** Upper bound on resent history in stateless mode (Open WebUI sends everything). */
const MAX_HISTORY_MESSAGES = 40;

function flattenContent(content: ChatMessage["content"]): string {
  if (typeof content === "string") {
    return content;
  }

  if (!content) {
    return "";
  }

  return content
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text as string)
    .join("\n");
}

/**
 * Normalises an OpenAI `messages` array for the agent: content parts are
 * flattened to text, **system messages are dropped** (an external client must
 * not be able to override the agent's instructions or brand scope), empty
 * messages are removed and history is capped. The final message must be from
 * the user — that is the turn the agent answers.
 */
export function toModelMessages(messages: ChatMessage[]): {
  messages: ModelMessageInput[];
  lastUser: ModelMessageInput;
} {
  const normalized: ModelMessageInput[] = [];

  for (const message of messages) {
    if (message.role === "system") {
      continue;
    }

    const content = flattenContent(message.content).trim();

    if (content.length === 0) {
      continue;
    }

    normalized.push(
      message.role === "user"
        ? { role: "user", content }
        : { role: "assistant", content },
    );
  }

  const capped = normalized.slice(-MAX_HISTORY_MESSAGES);
  const lastUser = capped.at(-1);

  if (!lastUser || lastUser.role !== "user") {
    throw new ExternalApiError(
      400,
      "invalid_messages",
      "The last message must be a non-empty user message.",
    );
  }

  return { messages: capped, lastUser };
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

export function newCompletionId(): string {
  return `chatcmpl-${randomBytes(12).toString("hex")}`;
}

type UsageLike = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export function toOpenAIUsage(usage?: UsageLike | null) {
  const prompt = usage?.inputTokens ?? 0;
  const completion = usage?.outputTokens ?? 0;

  return {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: usage?.totalTokens ?? prompt + completion,
  };
}

export type OpenAIFinishReason = "stop" | "length" | "content_filter";

export function toOpenAIFinishReason(
  reason: string | undefined | null,
): OpenAIFinishReason {
  switch (reason) {
    case "length":
      return "length";
    case "content-filter":
      return "content_filter";
    default:
      // "stop", "tool-calls", "other", "unknown", tripwire, … — the reply is
      // complete as far as the client is concerned.
      return "stop";
  }
}

/**
 * Tool activity surfaced to the reader. The Mastra chunk may carry the tool's
 * map key or its `id`, so both spellings are matched. Only the SQL tool gets
 * a line — it is the one that can take 5-20 s and would otherwise leave the
 * Open WebUI bubble blank.
 */
const SQL_TOOL_NAMES = new Set(["querySalesSql", "query-sales-sql"]);

export function toolStatusLine(toolName: string): string | null {
  return SQL_TOOL_NAMES.has(toolName) ? "\n\n_Querying sales data…_\n\n" : null;
}

export type CompletionEnvelope = {
  id: string;
  model: string;
  created: number;
};

type CompletionChunk = {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: {
    index: 0;
    delta: Record<string, unknown>;
    finish_reason: OpenAIFinishReason | null;
  }[];
  usage?: ReturnType<typeof toOpenAIUsage>;
};

const STREAM_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  // `no-transform` + X-Accel-Buffering keep proxies (nginx) from buffering
  // the SSE body — same trick as the in-app chat route.
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

/**
 * Encodes a Mastra agent run as OpenAI `chat.completion.chunk` SSE frames:
 * text deltas become `delta.content`, tool calls become a short status line,
 * the final chunk carries `finish_reason` + `usage`, then `data: [DONE]`.
 * A mid-stream failure is reported as a friendly line and still terminated
 * cleanly so the client closes the bubble.
 */
export function openAIStreamResponse({
  id,
  model,
  created,
  output,
  abort,
}: CompletionEnvelope & {
  output: MastraModelOutput;
  abort: AbortController;
}): Response {
  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
        );
      };
      const chunk = (
        delta: Record<string, unknown>,
        finishReason: OpenAIFinishReason | null = null,
        usage?: ReturnType<typeof toOpenAIUsage>,
      ): CompletionChunk => ({
        id,
        object: "chat.completion.chunk",
        created,
        model,
        choices: [{ index: 0, delta, finish_reason: finishReason }],
        ...(usage ? { usage } : {}),
      });

      let usage: UsageLike | undefined;
      let finishReason: OpenAIFinishReason = "stop";

      send(chunk({ role: "assistant", content: "" }));

      const reader = (
        output.fullStream as ReadableStream<ChunkType>
      ).getReader();

      try {
        for (;;) {
          const { done, value: part } = await reader.read();

          if (done) {
            break;
          }

          switch (part.type) {
            case "text-delta":
              if (part.payload.text) {
                send(chunk({ content: part.payload.text }));
              }
              break;
            case "tool-call": {
              const status = toolStatusLine(part.payload.toolName);
              if (status) {
                send(chunk({ content: status }));
              }
              break;
            }
            case "finish":
              usage = part.payload.output.usage;
              finishReason = toOpenAIFinishReason(
                part.payload.stepResult.reason,
              );
              break;
            case "error":
              throw part.payload.error instanceof Error
                ? part.payload.error
                : new Error(String(part.payload.error));
            default:
              // tool-result, step-*, reasoning-*, metadata … are not part of
              // the OpenAI wire format.
              break;
          }
        }

        send(
          chunk(
            {},
            finishReason,
            toOpenAIUsage(usage ?? (await output.totalUsage.catch(() => null))),
          ),
        );
      } catch (err) {
        if (!abort.signal.aborted) {
          console.error("[openai-compat] stream failed", err);
          send(
            chunk(
              {
                content:
                  "\n\n_The assistant hit an error while answering. Please try again._",
              },
              "stop",
            ),
          );
        }
      } finally {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
    cancel() {
      // Client went away (Open WebUI stop button / tab closed).
      abort.abort();
    },
  });

  return new Response(body, { headers: STREAM_HEADERS });
}

/** Non-streaming `chat.completion` body for the same agent run. */
export async function openAIJsonResponse({
  id,
  model,
  created,
  output,
}: CompletionEnvelope & { output: MastraModelOutput }): Promise<Response> {
  const text = await output.text;

  if (output.error) {
    throw output.error;
  }

  const [usage, finishReason] = await Promise.all([
    output.totalUsage.catch(() => null),
    output.finishReason,
  ]);

  return json({
    id,
    object: "chat.completion",
    created,
    model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: text },
        finish_reason: toOpenAIFinishReason(finishReason),
      },
    ],
    usage: toOpenAIUsage(usage),
  });
}
