<script lang="ts">
  import { goto } from "$app/navigation";
  import ReviewsTable from "$lib/components/aggregator-kpis/widgets/reviews-table.svelte";
  import DateRangeFilter from "$lib/components/date-range-filter.svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import * as NativeSelect from "$lib/components/ui/native-select/index.js";
  import {
    aggregatorLabel,
    formatKpiDateTime,
    type KpiSortDirection,
    type ReviewSortField,
  } from "$lib/services/aggregator-kpis/aggregator-kpis";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import SearchIcon from "@lucide/svelte/icons/search";
  import StarIcon from "@lucide/svelte/icons/star";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
  let searchForm: HTMLFormElement | null = null;
  let searchDebounceTimeout: ReturnType<typeof setTimeout> | null = null;

  const store = $derived(data.store);
  const storeTitle = $derived(store.name ?? `Store #${store.id}`);
  const rows = $derived(data.reviewsPage.items);
  const page = $derived(data.reviewsPage.page);
  const pageSize = $derived(data.reviewsPage.pageSize);
  const totalItems = $derived(data.reviewsPage.totalItems);
  const totalPages = $derived(data.reviewsPage.totalPages);
  const basePath = $derived(`/aggregator-kpis/reviews/${store.id}`);

  function submitSearchForm() {
    searchForm?.requestSubmit();
  }

  function handleSearchInput() {
    if (searchDebounceTimeout) {
      clearTimeout(searchDebounceTimeout);
    }

    searchDebounceTimeout = setTimeout(() => {
      searchDebounceTimeout = null;
      submitSearchForm();
    }, 400);
  }

  function handleSearchChange() {
    if (searchDebounceTimeout) {
      clearTimeout(searchDebounceTimeout);
      searchDebounceTimeout = null;
    }

    submitSearchForm();
  }

  function handleSearchKeydown(event: KeyboardEvent) {
    if (event.key !== "Enter") {
      return;
    }

    if (searchDebounceTimeout) {
      clearTimeout(searchDebounceTimeout);
      searchDebounceTimeout = null;
    }

    event.preventDefault();
    submitSearchForm();
  }

  function getRouteHref({
    page = data.reviewsPage.page,
    rating = data.rating,
    query = data.query,
    from = data.filters.from,
    to = data.filters.to,
    sortBy = data.sortBy,
    sortDir = data.sortDir,
  }: {
    page?: number;
    rating?: number | null;
    query?: string | null;
    from?: string | null;
    to?: string | null;
    sortBy?: ReviewSortField;
    sortDir?: KpiSortDirection;
  }) {
    const params = new URLSearchParams();

    if (rating) {
      params.set("rating", rating.toString());
    }

    if (query) {
      params.set("query", query);
    }

    if (from) {
      params.set("from", from);
    }

    if (to) {
      params.set("to", to);
    }

    if (sortBy && sortBy !== "reviewed_at") {
      params.set("sortBy", sortBy);
    }

    if (sortDir && sortDir !== "desc") {
      params.set("sortDir", sortDir);
    }

    if (page && page > 1) {
      params.set("page", page.toString());
    }

    const search = params.toString();

    return search ? `${basePath}?${search}` : basePath;
  }

  function getPageHref(targetPage: number) {
    return getRouteHref({ page: targetPage });
  }

  function applyDateRange(range: { from?: string; to?: string }) {
    goto(
      getRouteHref({
        page: 1,
        from: range.from ?? null,
        to: range.to ?? null,
      }),
    );
  }

  function getVisiblePages() {
    const start = Math.max(1, page - 2);
    const end = Math.min(totalPages, start + 4);
    const adjustedStart = Math.max(1, end - 4);

    return Array.from(
      { length: end - adjustedStart + 1 },
      (_, index) => adjustedStart + index,
    );
  }
</script>

<svelte:head>
  <title>{storeTitle} Reviews | Aggregator KPIs | Aggregator Offers Tool</title>
  <meta
    name="description"
    content="Customer reviews for {storeTitle} from aggregator KPI scraping."
  />
</svelte:head>

<div class="relative isolate min-h-screen overflow-hidden">
  <div class="bg-background absolute inset-0 -z-20"></div>
  <div
    class="absolute inset-x-0 top-0 -z-10 h-[24rem] bg-[radial-gradient(circle_at_top_left,_color-mix(in_oklab,var(--color-chart-3)_18%,transparent),transparent_34%),radial-gradient(circle_at_88%_14%,_color-mix(in_oklab,var(--color-chart-1)_18%,transparent),transparent_26%)]"
  ></div>

  <main
    class="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10"
  >
    <div
      class="flex flex-wrap items-center gap-2 text-xs tracking-[0.18em] text-zinc-500 uppercase"
    >
      <a href="/aggregator-kpis" class="hover:text-foreground transition-colors"
        >Aggregator KPIs</a
      >
      <ChevronRightIcon class="size-3" />
      <a
        href="/aggregator-kpis/reviews"
        class="hover:text-foreground transition-colors">Reviews</a
      >
      <ChevronRightIcon class="size-3" />
      <span class="normal-case">{storeTitle}</span>
    </div>

    <section class="space-y-3">
      <Badge
        variant="outline"
        class="px-3 py-1 text-[0.7rem] tracking-[0.22em] uppercase"
      >
        {aggregatorLabel(store.aggregator)}
      </Badge>
      <div class="flex flex-wrap items-center gap-3">
        <h1 class="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
          {storeTitle}
        </h1>
      </div>
      <p class="text-muted-foreground max-w-3xl text-base leading-7">
        {totalItems} captured review{totalItems === 1 ? "" : "s"} for this store.
        Click any row to inspect the complete review details.
      </p>
    </section>

    <section class="grid gap-6 xl:grid-cols-[20rem_minmax(0,1fr)]">
      <Card.Root class="h-fit">
        <Card.Header>
          <Card.Title>Store details</Card.Title>
        </Card.Header>
        <Card.Content>
          <dl class="space-y-3 text-sm">
            <div class="flex justify-between gap-4">
              <dt class="text-muted-foreground shrink-0">Platform</dt>
              <dd class="text-right font-medium">
                {aggregatorLabel(store.aggregator)}
              </dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt class="text-muted-foreground shrink-0">Brand</dt>
              <dd class="text-right font-medium">
                {store.brand?.brandName ?? "Unassigned"}
              </dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt class="text-muted-foreground shrink-0">Store id</dt>
              <dd class="text-right font-mono text-xs">{store.id}</dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt class="text-muted-foreground shrink-0">External id</dt>
              <dd class="text-right font-mono text-xs break-all">
                {store.externalId}
              </dd>
            </div>
            {#if store.slug}
              <div class="flex justify-between gap-4">
                <dt class="text-muted-foreground shrink-0">Slug</dt>
                <dd class="text-right font-mono text-xs break-all">
                  {store.slug}
                </dd>
              </div>
            {/if}
            <div class="flex justify-between gap-4">
              <dt class="text-muted-foreground shrink-0">First scraped</dt>
              <dd class="text-right font-medium">
                {formatKpiDateTime(store.createdAt)}
              </dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt class="text-muted-foreground shrink-0">Last updated</dt>
              <dd class="text-right font-medium">
                {formatKpiDateTime(store.updatedAt)}
              </dd>
            </div>
          </dl>

          {#if store.url}
            <a
              href={store.url}
              target="_blank"
              rel="noreferrer"
              class="text-primary mt-4 inline-block text-sm hover:underline"
            >
              View on {aggregatorLabel(store.aggregator)}
            </a>
          {/if}
        </Card.Content>
      </Card.Root>

      <Card.Root
        class="border-border/70 bg-background/90 overflow-hidden shadow-sm backdrop-blur"
      >
        <Card.Header>
          <div
            class="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between"
          >
            <div class="space-y-1">
              <Card.Title class="text-2xl tracking-[-0.03em]">
                Reviews
              </Card.Title>
              <Card.Description>
                Showing page {page} of {totalPages} with {pageSize} rows per page.
              </Card.Description>
            </div>

            <form
              method="GET"
              bind:this={searchForm}
              class="grid gap-3 lg:grid-cols-[minmax(0,15rem)_minmax(0,8rem)_auto_auto] lg:items-end"
            >
              <div class="space-y-2">
                <label class="text-sm font-medium" for="query">Search</label>
                <div class="relative">
                  <SearchIcon
                    class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                  />
                  <Input
                    id="query"
                    name="query"
                    value={data.query ?? ""}
                    placeholder="Review text"
                    class="pl-9"
                    oninput={handleSearchInput}
                    onkeydown={handleSearchKeydown}
                  />
                </div>
              </div>

              <div class="space-y-2">
                <label class="text-sm font-medium" for="rating">Stars</label>
                <NativeSelect.Root
                  id="rating"
                  name="rating"
                  value={data.rating?.toString() ?? ""}
                  onchange={handleSearchChange}
                >
                  <NativeSelect.Option value="">All</NativeSelect.Option>
                  {#each [1, 2, 3, 4, 5] as stars (stars)}
                    <NativeSelect.Option value={stars.toString()}>
                      {stars} star{stars === 1 ? "" : "s"}
                    </NativeSelect.Option>
                  {/each}
                </NativeSelect.Root>
              </div>

              <div class="space-y-2">
                <span class="text-sm font-medium">Review date</span>
                <DateRangeFilter
                  from={data.filters.from}
                  to={data.filters.to}
                  onApply={applyDateRange}
                />
              </div>

              {#if data.filters.from}
                <input type="hidden" name="from" value={data.filters.from} />
              {/if}
              {#if data.filters.to}
                <input type="hidden" name="to" value={data.filters.to} />
              {/if}
              <input type="hidden" name="sortBy" value={data.sortBy} />
              <input type="hidden" name="sortDir" value={data.sortDir} />

              <div class="flex gap-2">
                <Button type="submit">Apply</Button>
                <Button href={basePath} variant="outline">Reset</Button>
              </div>
            </form>
          </div>
        </Card.Header>

        <Card.Content>
          <div class="mb-4 flex flex-wrap items-center gap-2">
            <Badge variant="outline">{aggregatorLabel(store.aggregator)}</Badge>
            {#if data.query}
              <Badge variant="outline">Search: {data.query}</Badge>
            {/if}
            {#if data.rating}
              <Badge variant="outline">{data.rating} stars</Badge>
            {/if}
            {#if data.filters.from || data.filters.to}
              <Badge variant="outline">
                {data.filters.from ?? "..."} - {data.filters.to ?? "..."}
              </Badge>
            {/if}
            <span class="text-muted-foreground text-sm">
              {(page - 1) * pageSize + (totalItems === 0 ? 0 : 1)}-{Math.min(
                page * pageSize,
                totalItems,
              )} of {totalItems} reviews
            </span>
          </div>

          <ReviewsTable data={rows} />

          {#if totalItems > 0}
            <div
              class="mt-6 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-end"
            >
              <div class="flex flex-wrap items-center justify-end gap-2">
                <Button
                  variant="outline"
                  href={getPageHref(page - 1)}
                  disabled={page <= 1}
                >
                  Previous
                </Button>

                {#each getVisiblePages() as visiblePage (visiblePage)}
                  <Button
                    href={getPageHref(visiblePage)}
                    variant={visiblePage === page ? "default" : "outline"}
                    size="sm"
                  >
                    {visiblePage}
                  </Button>
                {/each}

                <Button
                  variant="outline"
                  href={getPageHref(page + 1)}
                  disabled={page >= totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          {/if}
        </Card.Content>
      </Card.Root>
    </section>
  </main>
</div>
