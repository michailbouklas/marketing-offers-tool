import { requirePermission } from "$lib/server/auth-guards";
import { listGeneratedCopies } from "$lib/services/copywriter/copywriter.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  const { user } = await requirePermission(event, {
    copywriter: ["generate"],
  });

  const pageParam = Number(event.url.searchParams.get("page") ?? "1");
  const history = await listGeneratedCopies({
    userId: user!.id,
    page: Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1,
  });

  return { history };
};
