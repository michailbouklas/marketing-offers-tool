import { randomUUID } from "node:crypto";
import { error, type RequestEvent } from "@sveltejs/kit";
import {
  shareAccess,
  withoutAttachments,
} from "$lib/components/ai-chat/chat-share";
import { getAuthenticatedUserRole } from "$lib/server/auth-guards";
import {
  listScopedBrands,
  type BrandScopeSubject,
} from "$lib/server/brand-scope.server";
import { authorizeAgent, threadIdFor } from "$lib/server/chat-thread";
import { getMastra } from "$lib/server/mastra";
import {
  chatAgentPagePaths,
  chatAgents,
} from "$lib/server/mastra/chat-registry";
import { prisma } from "$lib/server/prisma";

const NOT_FOUND = "This conversation does not exist or is no longer shared.";

/** P2021 = table missing: the ChatShare migration is not applied yet. */
export function isMissingTable(cause: unknown) {
  return (cause as { code?: string } | null)?.code === "P2021";
}

async function scopedAliases(subject: BrandScopeSubject) {
  return (await listScopedBrands(subject)).map((brand) => brand.alias);
}

/**
 * Creates the share of one of the owner's conversations, or returns the one
 * that exists. A brand-scoped agent's share records the owner's brand aliases
 * (an admin's "all brands" is simply every active alias); an existing share
 * keeps the aliases it was created with.
 */
export async function createShare(
  owner: BrandScopeSubject,
  agentId: string,
  sessionKey: string,
) {
  const brandAliases = chatAgents[agentId]?.brandScoped
    ? await scopedAliases(owner)
    : [];

  return prisma.chatShare.upsert({
    where: {
      userId_agentId_sessionKey: { userId: owner.id, agentId, sessionKey },
    },
    create: { userId: owner.id, agentId, sessionKey, brandAliases },
    update: {},
    select: { id: true },
  });
}

/** Stops sharing: the link returns 404 from then on. Idempotent. */
export async function revokeShare(
  userId: string,
  agentId: string,
  sessionKey: string,
) {
  await prisma.chatShare.deleteMany({ where: { userId, agentId, sessionKey } });
}

/**
 * Loads a shared conversation for the caller, or throws 404 (no such share,
 * or the conversation was deleted) / 403 (not allowed to see it). The owner's
 * thread is only ever read here, server side, after the access check.
 */
export async function openShare(event: RequestEvent, shareId: string) {
  const share = await prisma.chatShare
    .findUnique({
      where: { id: shareId },
      include: { user: { select: { name: true, role: true } } },
    })
    .catch((cause) => {
      if (isMissingTable(cause)) return null;
      throw cause;
    });

  if (!share) {
    error(404, NOT_FOUND);
  }

  const { agentId } = share;
  const { user: viewer } = await authorizeAgent(event, agentId);
  const agent = chatAgents[agentId];
  const isOwner = share.userId === viewer.id;

  let requiredAliases: string[] = [];
  let viewerAliases: string[] = [];

  if (!isOwner && agent?.brandScoped) {
    const [ownerAliases, ownAliases] = await Promise.all([
      scopedAliases({ id: share.userId, role: share.user.role }),
      scopedAliases({
        id: viewer.id,
        role: await getAuthenticatedUserRole(event),
      }),
    ]);
    // The link shows the live conversation, so answers added after sharing
    // may use brands the owner gained since: those are required as well.
    requiredAliases = [...share.brandAliases, ...ownerAliases];
    viewerAliases = ownAliases;
  }

  const access = shareAccess({
    isOwner,
    agent,
    requiredAliases,
    viewerAliases,
  });

  if (access === "unsupported") {
    error(404, NOT_FOUND);
  }

  if (access === "forbidden") {
    error(
      403,
      "This conversation includes data for brands you do not have access to.",
    );
  }

  const memory = await getMastra().getAgentById(agentId).getMemory();
  const threadId = threadIdFor(agentId, share.userId, share.sessionKey);
  const thread = await memory?.getThreadById({ threadId });

  if (!memory || !thread) {
    error(404, NOT_FOUND);
  }

  // The whole thread; the default is only the newest messages.
  const { messages } = await memory.recall({
    threadId,
    resourceId: share.userId,
    perPage: false,
  });

  return {
    agentId,
    viewerId: viewer.id,
    isOwner,
    ownerName: share.user.name,
    title: thread.title || "Untitled conversation",
    memory,
    messages: withoutAttachments(messages),
  };
}

/**
 * Copies a shared conversation into a new thread owned by the caller and
 * returns the URL of the agent's chat page opened on it.
 */
export async function copySharedConversation(
  event: RequestEvent,
  shareId: string,
) {
  const shared = await openShare(event, shareId);
  const sessionKey = randomUUID();
  const threadId = threadIdFor(shared.agentId, shared.viewerId, sessionKey);

  await shared.memory.createThread({
    threadId,
    resourceId: shared.viewerId,
    title: `Copy of ${shared.title}`.slice(0, 200),
  });

  if (shared.messages.length > 0) {
    await shared.memory.saveMessages({
      // New ids: saving under the stored ids would move the owner's messages.
      messages: shared.messages.map((message) => ({
        ...message,
        id: randomUUID(),
        threadId,
        resourceId: shared.viewerId,
      })),
    });
  }

  return `${chatAgentPagePaths[shared.agentId] ?? "/"}?session=${sessionKey}`;
}
