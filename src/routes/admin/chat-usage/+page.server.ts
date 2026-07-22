import { requireSuperUser } from "$lib/server/auth-guards";
import { getChatUsageOverview } from "$lib/services/chat-usage.server";
import type { PageServerLoad } from "./$types";

/**
 * SuperUser-only overview of AI chat usage across all users, backed by the
 * read-only views over Mastra's chat storage.
 */
export const load: PageServerLoad = async (event) => {
  await requireSuperUser(event);

  const overview = await getChatUsageOverview();

  return { overview };
};
