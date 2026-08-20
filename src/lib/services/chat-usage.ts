/**
 * Client-safe types and helpers for the superUser-only AI chat usage pages
 * (`/admin/chat-usage`). Data comes from the read-only Prisma views over
 * Mastra's chat storage (`ai_chat_threads` / `ai_chat_messages`); the server
 * queries live in `chat-usage.server.ts`.
 */

export const untitledConversation = "Untitled conversation";

export type ChatAgentCount = {
  agentId: string;
  count: number;
};

export type ChatUserCount = {
  userId: string;
  /** Null when the user account has been deleted since the chats happened. */
  name: string | null;
  email: string | null;
  count: number;
  lastActivity: string | null;
};

export type ChatUsageOverview = {
  totalChats: number;
  perAgent: ChatAgentCount[];
  perUser: ChatUserCount[];
};

export type UserChatThread = {
  id: string;
  title: string;
  updatedAt: string | null;
  messageCount: number;
};

export type UserChatAgentGroup = {
  agentId: string;
  threads: UserChatThread[];
};

/**
 * Minimal shape of the AI SDK UIMessages returned by the conversation API —
 * only the parts the dialog renders (text and tool markers).
 */
export type ChatConversationMessage = {
  id?: string;
  role: string;
  parts: {
    type: string;
    text?: string;
    /** Tool parts: lifecycle state, call input, result, and error text. */
    state?: string;
    input?: unknown;
    output?: unknown;
    errorText?: string;
  }[];
};

export type ChatConversationResponse = {
  thread: {
    id: string;
    title: string;
    agentId: string;
    userId: string;
    updatedAt: string | null;
  };
  messages: ChatConversationMessage[];
};

/**
 * Human label for an agent id, e.g. "invoices-agent" → "Invoices agent".
 * Falls back to a generic label for threads whose id prefix no longer maps
 * to a registered agent.
 */
export function agentLabel(agentId: string): string {
  if (!agentId || agentId === "unknown") {
    return "Unknown agent";
  }

  const words = agentId.replaceAll("-", " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
