import { toAISdkMessages } from "@mastra/ai-sdk/ui";
import { error, redirect } from "@sveltejs/kit";
import {
  copySharedConversation,
  openShare,
} from "$lib/services/chat-share.server";
import { assistantLabel } from "$lib/services/skills/assistants";
import { z } from "zod";
import type { Actions, PageServerLoad } from "./$types";

// Markdown is sanitized with DOMPurify, which needs a browser: a server render
// would show the raw text and hydration keeps server HTML as it is.
export const ssr = false;

// The link token is a cuid; anything else cannot be a share.
const shareIdSchema = z.string().regex(/^[a-z0-9]{20,40}$/);

function shareIdOf(params: { id: string }) {
  const id = shareIdSchema.safeParse(params.id);

  if (!id.success) {
    error(404, "This conversation does not exist or is no longer shared.");
  }

  return id.data;
}

type ToolPartView = {
  type: string;
  state?: string;
  input?: unknown;
  errorText?: string;
  toolName?: string;
  output?: { ok: false; error?: string };
};

// Only what the read-only page renders leaves the server: the tool's label,
// its SQL and a failure text, never the result rows.
function toolPartView(part: { type: string }): ToolPartView {
  const tool = part as ToolPartView & {
    output?: { ok?: boolean; error?: string };
  };

  return {
    type: tool.type,
    state: tool.state,
    input: tool.input,
    errorText: tool.errorText,
    toolName: tool.toolName,
    output:
      tool.output?.ok === false
        ? { ok: false, error: tool.output.error }
        : undefined,
  };
}

export const load: PageServerLoad = async (event) => {
  const shared = await openShare(event, shareIdOf(event.params));
  const createdAtById = new Map(
    shared.messages.map((message) => [
      message.id,
      message.createdAt ? new Date(message.createdAt).toISOString() : null,
    ]),
  );

  return {
    title: shared.title,
    ownerName: shared.ownerName,
    isOwner: shared.isOwner,
    assistant: assistantLabel(shared.agentId),
    messages: toAISdkMessages(shared.messages, { version: "v6" })
      .filter(
        (message) => message.role === "user" || message.role === "assistant",
      )
      .map((message) => ({
        id: message.id,
        role: message.role,
        createdAt: createdAtById.get(message.id) ?? null,
        parts: message.parts.flatMap(
          (part): ({ type: "text"; text: string } | ToolPartView)[] => {
            if (part.type === "text") {
              return [{ type: "text", text: part.text }];
            }
            return part.type.startsWith("tool-") || part.type === "dynamic-tool"
              ? [toolPartView(part)]
              : [];
          },
        ),
      })),
  };
};

export const actions: Actions = {
  /** "Continue as my copy": a new thread of the viewer's own. */
  copy: async (event) => {
    redirect(303, await copySharedConversation(event, shareIdOf(event.params)));
  },
};
