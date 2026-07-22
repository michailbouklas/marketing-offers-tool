import { Memory } from "@mastra/memory";
import { PostgresStore } from "@mastra/pg";
import { getDatabaseUrl } from "./env";

const globalForChatMemory = globalThis as typeof globalThis & {
  chatMemoryCache?: Memory;
};

/**
 * Conversation memory shared by all chat agents: threads/messages live in the
 * app's PostgreSQL database under the dedicated "mastra" schema so Prisma
 * migrations (which manage "public") never see drift. One instance serves
 * every agent — thread ids are already namespaced per agent by the chat
 * endpoint (`<agentId>:<userId>:<sessionKey>`), and sharing avoids a pg pool
 * per agent.
 *
 * Resolved lazily (agent configs take a function) so importing this module
 * never touches DATABASE_URL — SvelteKit imports server modules during
 * `vite build`, where no env is available (e.g. the Docker builder stage).
 * Same reasoning as the lazy proxy in $lib/server/prisma.
 */
export function getChatMemory(): Memory {
  globalForChatMemory.chatMemoryCache ??= new Memory({
    storage: new PostgresStore({
      id: "ai-chat-memory",
      connectionString: getDatabaseUrl(),
      schemaName: "mastra",
    }),
    options: {
      lastMessages: 20,
      // Titles label the per-user session list in the chat widget. Pinned to
      // a cheap model regardless of AI_CHAT_MODEL.
      generateTitle: {
        model: "openai/gpt-4o-mini",
        instructions:
          "Generate a concise title (max 6 words) summarizing what the user is asking about. Plain text, no quotes.",
      },
    },
  });

  return globalForChatMemory.chatMemoryCache;
}
