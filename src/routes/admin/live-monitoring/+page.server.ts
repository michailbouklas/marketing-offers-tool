import { requireSuperUser } from "$lib/server/auth-guards";
import type { PageServerLoad } from "./$types";

/**
 * SuperUser-only live view of who has the tool open and which page each of
 * their tabs is on. Data arrives over SSE from
 * `/api/admin/live-monitoring/stream`; the load only enforces the role.
 */
export const load: PageServerLoad = async (event) => {
  await requireSuperUser(event);

  return {};
};
