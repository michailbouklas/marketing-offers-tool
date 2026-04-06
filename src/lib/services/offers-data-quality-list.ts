import {
  gapQueueResponseSchema,
  type GapListSortDirection,
  type GapListSortField,
} from "$lib/services/offers-data-quality";

type FetchGapQueueInput = {
  brandAliases: string[];
  page: number;
  sortBy: GapListSortField;
  sortDir: GapListSortDirection;
};

export async function fetchGapQueue(
  fetchFn: typeof fetch,
  input: FetchGapQueueInput,
) {
  const params = new URLSearchParams();

  for (const brandAlias of input.brandAliases) {
    params.append("brandAlias", brandAlias);
  }

  if (input.page > 1) {
    params.set("page", input.page.toString());
  }

  if (input.sortBy !== "brand") {
    params.set("sortBy", input.sortBy);
  }

  if (input.sortDir !== "asc") {
    params.set("sortDir", input.sortDir);
  }

  const response = await fetchFn(`/api/gaps?${params.toString()}`);

  if (!response.ok) {
    throw new Error("Unable to refresh the gap queue.");
  }

  const result = gapQueueResponseSchema.safeParse(await response.json());

  if (!result.success) {
    throw new Error("Received an invalid gap queue response.");
  }

  return result.data;
}
