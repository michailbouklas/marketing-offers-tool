/**
 * Share-link rules, free of server imports so the history menu can use them
 * and they can be unit tested without a database.
 */

import {
  ATTACHMENT_REF_MARKERS,
  parseAttachmentText,
} from "$lib/components/ai-chat/attachments";

/** Shown wherever a shared conversation had a file. */
export const ATTACHMENT_NOT_SHARED = "[attachment not shared]";

/**
 * Agents whose conversations cannot be shared. Mirror of the scope flags in
 * the server-only chat registry (`chat-share.test.ts` keeps the two in step).
 */
export const UNSHAREABLE_AGENT_IDS: readonly string[] = [
  "google-analytics-agent",
  "management-accounts-agent",
];

/** The scope flags of a `ChatAgentConfig` that decide sharing. */
export type ShareAgentScope = {
  brandScoped?: boolean;
  googleAnalyticsScoped?: boolean;
  managementAccountsScoped?: boolean;
};

// shortcut: Google Analytics and management accounts conversations are never
// shared, because their scope is GA4 properties / GL companies and a share only
// stores brand aliases; upgrade by storing that scope on the share and
// comparing it here once someone needs to share those assistants.
export function isShareableAgent(agent: ShareAgentScope | undefined) {
  return (
    !!agent && !agent.googleAnalyticsScoped && !agent.managementAccountsScoped
  );
}

export type ShareAccess = "ok" | "forbidden" | "unsupported";

/**
 * May this viewer open this share? The caller has already checked that the
 * viewer may use the agent at all.
 *
 * - The owner always may.
 * - A brand-scoped conversation holds numbers for the owner's brands, so the
 *   viewer's brands must include every one of `requiredAliases`.
 * - An agent without a data scope has nothing more to check.
 */
export function shareAccess(input: {
  isOwner: boolean;
  agent: ShareAgentScope | undefined;
  /** Brand aliases the conversation may contain numbers for. */
  requiredAliases: string[];
  /** The viewer's own current brand aliases. */
  viewerAliases: string[];
}): ShareAccess {
  if (input.isOwner) return "ok";
  if (!isShareableAgent(input.agent)) return "unsupported";
  if (!input.agent?.brandScoped) return "ok";

  const allowed = new Set(input.viewerAliases);
  return input.requiredAliases.every((alias) => allowed.has(alias))
    ? "ok"
    : "forbidden";
}

type StoredMessage = {
  content: {
    parts: { type: string; text?: string }[];
    content?: unknown;
    experimental_attachments?: unknown;
  };
};

function withoutMarkers(text: string) {
  return parseAttachmentText(text)
    ? ATTACHMENT_NOT_SHARED
    : text.replace(ATTACHMENT_REF_MARKERS, ATTACHMENT_NOT_SHARED);
}

/**
 * Stored (Mastra) messages with every attachment replaced by a placeholder.
 * Files live in the object store under the owner and are never shared, and a
 * reference left in a copy would point at a file the new owner does not have.
 */
export function withoutAttachments<Message extends StoredMessage>(
  messages: Message[],
): Message[] {
  return messages.map((message) => ({
    ...message,
    content: {
      ...message.content,
      experimental_attachments: undefined,
      content:
        typeof message.content.content === "string"
          ? withoutMarkers(message.content.content)
          : message.content.content,
      parts: message.content.parts.map((part) => {
        if (part.type === "file") {
          return { type: "text", text: ATTACHMENT_NOT_SHARED };
        }
        return part.type === "text" && typeof part.text === "string"
          ? { ...part, text: withoutMarkers(part.text) }
          : part;
      }),
    },
  })) as Message[];
}
