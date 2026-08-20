import { error, json } from "@sveltejs/kit";
import { handleChatStream } from "@mastra/ai-sdk";
import { toAISdkMessages } from "@mastra/ai-sdk/ui";
import { RequestContext } from "@mastra/core/request-context";
import { createUIMessageStreamResponse } from "ai";
import { adminRoles, hasAnyRole } from "$lib/auth/roles";
import {
  getAuthenticatedUserRole,
  requireApiPermission,
  requireAuthenticatedApiUser,
} from "$lib/server/auth-guards";
import { getMastra } from "$lib/server/mastra";
import {
  BRAND_SCOPE_NAMES_RUNTIME_KEY,
  BRAND_SCOPE_RUNTIME_KEY,
  chatAgents,
} from "$lib/server/mastra/chat-registry";
import { listBrands, listBrandsForUser } from "$lib/services/brands.server";
import { z } from "zod";
import type { RequestEvent, RequestHandler } from "./$types";

const sessionKeySchema = z.uuid();

/**
 * Shape sent by the chat widget's DefaultChatTransport: the UIMessage history
 * plus the section-specific agent id and the client-chosen session key.
 * Messages are passed through to Mastra as-is (it validates the UIMessage
 * format), so only the envelope is checked.
 */
const requestSchema = z.object({
  agentId: z.string(),
  sessionKey: sessionKeySchema,
  messages: z.array(z.record(z.string(), z.unknown())).min(1),
});

/**
 * Memory thread ids are namespaced server-side per agent AND user, so a
 * client-supplied session key can only ever address the caller's own
 * conversations. "Clearing" the window is just switching to a fresh key —
 * previous threads stay in storage and remain recallable.
 */
function threadIdFor(agentId: string, userId: string, sessionKey: string) {
  return `${agentId}:${userId}:${sessionKey}`;
}

async function authorizeAgent(event: RequestEvent, agentId: string) {
  const agent = chatAgents[agentId];

  if (!agent) {
    error(400, `Unknown chat agent "${agentId}"`);
  }

  // A configured permission gates the agent; when omitted, any authenticated
  // user may talk to it (mirrors the agent's page guard).
  if (agent.permissions) {
    return requireApiPermission(event, agent.permissions);
  }

  return requireAuthenticatedApiUser(event);
}

/**
 * For `brandScoped` agents, publish the caller's assigned brand aliases (and
 * their display names) into a RequestContext the agent reads in its dynamic
 * instructions and the SQL tools read as a hard guardrail. The brand list is
 * always derived server-side from the authenticated user — it is never taken
 * from the request body — so a user can only ever scope to their own brands.
 * superUser/admin callers are scoped to ALL active brands instead of their
 * explicit assignments (applies to every brandScoped agent). Returns
 * undefined for non-brand-scoped agents (no override).
 */
async function buildBrandRequestContext(
  event: RequestEvent,
  agentId: string,
  userId: string,
): Promise<RequestContext | undefined> {
  if (!chatAgents[agentId]?.brandScoped) {
    return undefined;
  }

  const role = await getAuthenticatedUserRole(event);
  const brands = hasAnyRole(role, adminRoles)
    ? await listBrands({ active: true })
    : await listBrandsForUser(userId);

  // Keep the two arrays index-aligned: a brand without an alias cannot be
  // filtered on in the warehouse, so it is dropped from both lists.
  const scoped = brands
    .map((brand) => ({ alias: brand.alias.trim(), name: brand.name.trim() }))
    .filter((brand) => brand.alias.length > 0);

  const requestContext = new RequestContext();
  requestContext.set(
    BRAND_SCOPE_RUNTIME_KEY,
    scoped.map((brand) => brand.alias),
  );
  requestContext.set(
    BRAND_SCOPE_NAMES_RUNTIME_KEY,
    scoped.map((brand) => brand.name || brand.alias),
  );

  return requestContext;
}

export const POST: RequestHandler = async (event) => {
  const body = requestSchema.safeParse(
    await event.request.json().catch(() => null),
  );

  if (!body.success) {
    error(400, "Invalid chat request");
  }

  const { agentId, sessionKey } = body.data;
  const { user } = await authorizeAgent(event, agentId);

  const requestContext = await buildBrandRequestContext(
    event,
    agentId,
    user.id,
  );

  const stream = await handleChatStream({
    mastra: getMastra(),
    agentId,
    version: "v6",
    params: {
      // Cast: the zod pass-through type is looser than Mastra's UIMessage.
      messages: body.data.messages as never,
      maxSteps: 8,
      ...(requestContext ? { requestContext } : {}),
      memory: {
        thread: threadIdFor(agentId, user.id, sessionKey),
        resource: user.id,
      },
    },
  });

  return createUIMessageStreamResponse({ stream });
};

export type ChatSessionSummary = {
  key: string;
  title: string;
  updatedAt: string | null;
};

/**
 * Without `session`: lists the user's stored conversations for an agent
 * (newest first) so the widget can render a history menu. With `session`:
 * returns that conversation's messages as AI SDK UIMessages, rendered as-is.
 */
export const GET: RequestHandler = async (event) => {
  const agentId = event.url.searchParams.get("agentId") ?? "";
  const sessionParam = event.url.searchParams.get("session");
  const { user } = await authorizeAgent(event, agentId);

  const memory = await getMastra().getAgentById(agentId).getMemory();

  if (!memory) {
    return json(sessionParam ? [] : { sessions: [] });
  }

  if (sessionParam) {
    const sessionKey = sessionKeySchema.safeParse(sessionParam);

    if (!sessionKey.success) {
      error(400, "Invalid session key");
    }

    try {
      const recalled = await memory.recall({
        threadId: threadIdFor(agentId, user.id, sessionKey.data),
        resourceId: user.id,
      });

      return json(toAISdkMessages(recalled?.messages ?? [], { version: "v6" }));
    } catch {
      // Unknown/empty thread — an empty conversation, not an error.
      return json([]);
    }
  }

  const threadPrefix = threadIdFor(agentId, user.id, "");
  const { threads } = await memory.listThreads({
    filter: { resourceId: user.id },
    perPage: false,
  });

  const sessions: ChatSessionSummary[] = threads
    .filter((thread) => thread.id.startsWith(threadPrefix))
    .map((thread) => ({
      key: thread.id.slice(threadPrefix.length),
      title: thread.title || "Untitled conversation",
      updatedAt: thread.updatedAt
        ? new Date(thread.updatedAt).toISOString()
        : null,
    }))
    .sort((left, right) =>
      (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""),
    );

  return json({ sessions });
};

/**
 * Permanently removes one of the caller's own stored conversations. The
 * thread id is namespaced per agent + user (threadIdFor), so a client key
 * can never address another user's thread. Idempotent: deleting a missing
 * thread still returns 204. Deletion goes through the Mastra memory API —
 * the Prisma ai_chat_* views over this storage are read-only.
 */
export const DELETE: RequestHandler = async (event) => {
  const agentId = event.url.searchParams.get("agentId") ?? "";
  const { user } = await authorizeAgent(event, agentId);

  const sessionKey = sessionKeySchema.safeParse(
    event.url.searchParams.get("session"),
  );

  if (!sessionKey.success) {
    error(400, "Invalid session key");
  }

  const memory = await getMastra().getAgentById(agentId).getMemory();

  if (memory) {
    try {
      await memory.deleteThread(threadIdFor(agentId, user.id, sessionKey.data));
    } catch {
      // Unknown or already-deleted thread — treat as success.
    }
  }

  return new Response(null, { status: 204 });
};
