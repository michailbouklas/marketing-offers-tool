import { json } from "@sveltejs/kit";
import { requireApiPermission } from "$lib/server/auth-guards";
import { listGeneratedCopies } from "$lib/services/copywriter/copywriter.server";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async (event) => {
  const { user } = await requireApiPermission(event, {
    copywriter: ["generate"],
  });

  const pageParam = Number(event.url.searchParams.get("page") ?? "1");
  const limitParam = Number(event.url.searchParams.get("limit") ?? "");

  const result = await listGeneratedCopies({
    userId: user.id,
    page: Number.isFinite(pageParam) ? pageParam : 1,
    limit:
      Number.isFinite(limitParam) && limitParam > 0 ? limitParam : undefined,
  });

  return json(result);
};
