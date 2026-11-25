import { requireSuperUser } from "$lib/server/auth-guards";
import {
  getChatFeedback,
  getChatUsageOverview,
} from "$lib/services/chat-usage.server";
import type { PageServerLoad } from "./$types";

/**
 * SuperUser-only overview of AI chat usage across all users, backed by
 * read-only views over Mastra's chat storage, plus the answer feedback.
 */
export const load: PageServerLoad = async (event) => {
  await requireSuperUser(event);

  const [overview, feedback] = await Promise.all([
    getChatUsageOverview(),
    getChatFeedback(),
  ]);

  return { overview, feedback };
};
