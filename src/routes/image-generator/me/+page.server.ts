import { requireAuthenticatedUser } from "$lib/server/auth-guards";
import { loadGenerationsHistory } from "$lib/server/generations-history";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  const { user } = requireAuthenticatedUser(event);

  return loadGenerationsHistory(event.url, user!.id);
};
