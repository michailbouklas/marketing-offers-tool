import { error, type RequestEvent } from "@sveltejs/kit";
import type { MastraMemory } from "@mastra/core/memory";
import { hasAnyRole } from "$lib/auth/roles";
import {
  getAuthenticatedUserRole,
  requireApiPermission,
  requireAuthenticatedApiUser,
} from "$lib/server/auth-guards";
import { chatAgents } from "$lib/server/mastra/chat-registry";

/**
 * Memory thread ids are namespaced server-side per agent AND user, so a
 * client-supplied session key can only ever address the caller's own
 * conversations. "Clearing" the window is just switching to a fresh key —
 * previous threads stay in storage and remain recallable.
 */
export function threadIdFor(
  agentId: string,
  userId: string,
  sessionKey: string,
) {
  return `${agentId}:${userId}:${sessionKey}`;
}

/** Shared by every chat API route: is the caller allowed to use this agent? */
export async function authorizeAgent(event: RequestEvent, agentId: string) {
  const agent = chatAgents[agentId];

  if (!agent) {
    error(400, `Unknown chat agent "${agentId}"`);
  }

  // A configured permission gates the agent; when omitted, any authenticated
  // user may talk to it (mirrors the agent's page guard).
  const caller = agent.permissions
    ? await requireApiPermission(event, agent.permissions)
    : requireAuthenticatedApiUser(event);

  if (
    agent.roles &&
    !hasAnyRole(await getAuthenticatedUserRole(event), agent.roles)
  ) {
    error(403, "Forbidden");
  }

  return caller;
}

type StoredThread = Pick<MastraMemory, "recall" | "deleteMessages">;

// perPage false: the whole thread, oldest first (the default is only the
// newest `lastMessages`). An unknown thread reads as empty.
async function storedIds(
  memory: StoredThread,
  threadId: string,
  resourceId: string,
) {
  try {
    const { messages } = await memory.recall({
      threadId,
      resourceId,
      perPage: false,
    });
    return messages.map((message) => message.id);
  } catch {
    return [];
  }
}

/**
 * Edit/retry: removes the stored message `fromMessageId` and every later one
 * from the thread, so the regenerated turn replaces the abandoned branch.
 * Ids are looked up inside the given thread first (`deleteMessages` itself
 * takes any id), so only that thread can be touched. Returns the ids that
 * stay; nothing is removed when the message is unknown.
 */
export async function truncateThread(
  memory: StoredThread,
  threadId: string,
  resourceId: string,
  fromMessageId: string,
): Promise<string[]> {
  const ids = await storedIds(memory, threadId, resourceId);
  const cutIndex = ids.indexOf(fromMessageId);
  if (cutIndex < 0) {
    return ids;
  }

  await memory.deleteMessages(ids.slice(cutIndex));
  return ids.slice(0, cutIndex);
}

// shortcut: in-process registry, so an edit/retry that lands on another
// server instance cannot stop the old run; move to shared state if the app
// is ever scaled past one Node process.
const runs = new Map<
  string,
  { abort: AbortController; settled: Promise<void> }
>();

/** Longest an edit/retry waits for the answer it replaces to stop. */
const STOP_RUN_TIMEOUT_MS = 10_000;

/** Aborts the thread's running answer, if any; resolves once it has ended. */
async function stopRun(threadId: string): Promise<boolean> {
  const run = runs.get(threadId);
  if (!run) return false;

  run.abort.abort();
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    run.settled,
    new Promise((resolve) => {
      timer = setTimeout(resolve, STOP_RUN_TIMEOUT_MS);
    }),
  ]);
  clearTimeout(timer);
  return true;
}

/**
 * Call before streaming an answer. With `truncateFrom` (edit/retry) the
 * stored thread is cut from that message first. Returns options to spread
 * into the agent stream params; call `end` yourself if the stream never
 * starts.
 *
 * Mastra saves a turn only when it ends, so an answer that is still running
 * (the user pressed stop, then edited) is not stored yet when the cut runs.
 * That run is aborted here, and whatever it saved late is removed when the
 * new answer ends: everything stored before `newMessageId` that the cut did
 * not keep.
 */
export async function beginRun(
  memory: StoredThread | undefined,
  threadId: string,
  resourceId: string,
  newMessageId: unknown,
  truncateFrom?: string,
) {
  let removeLate: (() => Promise<void>) | undefined;

  if (truncateFrom && memory) {
    const replacesRunning = await stopRun(threadId);
    const kept = new Set(
      await truncateThread(memory, threadId, resourceId, truncateFrom),
    );

    if (replacesRunning && typeof newMessageId === "string") {
      removeLate = async () => {
        const ids = await storedIds(memory, threadId, resourceId);
        // An unsaved new message (index -1) means nothing can be placed.
        const late = ids
          .slice(0, Math.max(0, ids.indexOf(newMessageId)))
          .filter((id) => !kept.has(id));
        await memory.deleteMessages(late);
      };
    }
  }

  const abort = new AbortController();
  let settle = () => {};
  const run = {
    abort,
    settled: new Promise<void>((resolve) => {
      settle = resolve;
    }),
  };
  runs.set(threadId, run);

  const end = async () => {
    try {
      await removeLate?.();
    } catch (cause) {
      console.error("[ai-chat] removing a replaced turn failed", cause);
    } finally {
      if (runs.get(threadId) === run) runs.delete(threadId);
      settle();
    }
  };

  return {
    abortSignal: abort.signal,
    onFinish: end,
    onAbort: end,
    onError: end,
  };
}
