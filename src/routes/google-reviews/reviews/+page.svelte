<script lang="ts">
  import { goto } from "$app/navigation";
  import DateRangeFilter from "$lib/components/date-range-filter.svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import * as NativeSelect from "$lib/components/ui/native-select/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import {
    formatGoogleReviewsDateTime,
    formatSentimentLabel,
    sentimentBadgeClass,
    sentimentValues,
    type GoogleReviewsSortDirection,
    type ReviewSortField,
    type SentimentValue,
  } from "$lib/services/google-reviews/google-reviews";
  import ArrowDownIcon from "@lucide/svelte/icons/arrow-down";
  import ArrowUpIcon from "@lucide/svelte/icons/arrow-up";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import FilterIcon from "@lucide/svelte/icons/filter";
  import SearchIcon from "@lucide/svelte/icons/search";
  import StarIcon from "@lucide/svelte/icons/star";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
  let searchForm: HTMLFormElement | null = null;
  let searchDebounceTimeout: ReturnType<typeof setTimeout> | null = null;

  const rows = $derived(data.reviewsPage.items);
  const page = $derived(data.reviewsPage.page);
  const pageSize = $derived(data.reviewsPage.pageSize);
  const totalItems = $derived(data.reviewsPage.totalItems);
  const totalPages = $derived(data.reviewsPage.totalPages);

  const sortableColumns: { key: ReviewSortField; label: string }[] = [
    { key: "review_date", label: "Date" },
    { key: "business_title", label: "Business" },
    { key: "reviewer_name", label: "Reviewer" },
    { key: "rating", label: "Rating" },
    { key: "sentiment", label: "Sentiment" },
  ];

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
    page,
    business = data.businessQuery,
    cid = data.businessCid,
    rating = data.rating,
    sentiment = data.sentiment,
    from = data.from,
    to = data.to,
    sortBy = data.sortBy,
    sortDir = data.sortDir,
  }: {
    page?: number;
    business?: string | null;
    cid?: string | null;
    rating?: number | null;
    sentiment?: SentimentValue | null;
    from?: string | null;
    to?: string | null;
    sortBy?: ReviewSortField;
    sortDir?: GoogleReviewsSortDirection;
  }) {
    const params = new URLSearchParams();

    if (business) {
      params.set("business", business);
    }

    if (cid) {
      params.set("cid", cid);
    }

    if (rating) {
      params.set("rating", rating.toString());
    }

    if (sentiment) {
      params.set("sentiment", sentiment);
    }

    if (from) {
      params.set("from", from);
    }

    if (to) {
      params.set("to", to);
    }

    if (sortBy && sortBy !== "review_date") {
      params.set("sortBy", sortBy);
    }

    if (sortDir && sortDir !== "desc") {
      params.set("sortDir", sortDir);
    }

    if (page && page > 1) {
      params.set("page", page.toString());
    }

    const search = params.toString();

    return search
      ? `/google-reviews/reviews?${search}`
      : "/google-reviews/reviews";
  }

  function getPageHref(targetPage: number) {
    return getRouteHref({ page: targetPage });
  }

  function getSortHref(column: ReviewSortField) {
    const nextDir: GoogleReviewsSortDirection =
      data.sortBy === column && data.sortDir === "asc" ? "desc" : "asc";

    return getRouteHref({ page: 1, sortBy: column, sortDir: nextDir });
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

  function getBusinessHref(row: (typeof rows)[number]) {
    return row.businessCid
      ? `/google-reviews/businesses/${row.businessCid}`
      : null;
  }
</script>

<svelte:head>
  <title>Reviews | Google Reviews | Aggregator Offers Tool</title>
  <meta
    name="description"
    content="All scraped Google reviews, filterable by business, time, star rating, and sentiment."
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
      <a href="/google-reviews" class="hover:text-foreground transition-colors"
        >Google Reviews</a
      >
      <ChevronRightIcon class="size-3" />
      <span>Reviews</span>
    </div>

    <section class="space-y-2">
      <h1 class="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
        Reviews
      </h1>
      <p class="text-muted-foreground max-w-3xl text-base leading-7">
        Every Google review the scraper captured, with the star rating and the
        sentiment the analysis pipeline assigned.
      </p>
    </section>

    <Card.Root
      class="border-border/70 bg-background/90 overflow-hidden shadow-sm backdrop-blur"
    >
      <Card.Header>
        <div
          class="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between"
        >
          <div class="space-y-1">
            <Card.Title class="text-2xl tracking-[-0.03em]">Reviews</Card.Title>
            <Card.Description>
              Showing page {page} of {totalPages} with {pageSize} rows per page.
            </Card.Description>
          </div>

          <form
            method="GET"
            bind:this={searchForm}
            class="grid gap-3 lg:grid-cols-[minmax(0,15rem)_minmax(0,8rem)_minmax(0,10rem)_auto_auto] lg:items-end"
          >
            <div class="space-y-2">
              <label class="text-sm font-medium" for="business">Business</label>
              <div class="relative">
                <SearchIcon
                  class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                />
                <Input
                  id="business"
                  name="business"
                  value={data.businessQuery ?? ""}
                  placeholder="Business name"
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
              <label class="text-sm font-medium" for="sentiment"
                >Sentiment</label
              >
              <div class="relative">
                <FilterIcon
                  class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                />
                <NativeSelect.Root
                  id="sentiment"
                  name="sentiment"
                  value={data.sentiment ?? ""}
                  class="pl-9 capitalize"
                  onchange={handleSearchChange}
                >
                  <NativeSelect.Option value="">All</NativeSelect.Option>
                  {#each sentimentValues as sentiment (sentiment)}
                    <NativeSelect.Option value={sentiment}>
                      {formatSentimentLabel(sentiment)}
                    </NativeSelect.Option>
                  {/each}
                </NativeSelect.Root>
              </div>
            </div>

            <div class="space-y-2">
              <span class="text-sm font-medium">Review date</span>
              <DateRangeFilter
                from={data.from}
                to={data.to}
                onApply={applyDateRange}
              />
            </div>

            {#if data.businessCid}
              <input type="hidden" name="cid" value={data.businessCid} />
            {/if}
            {#if data.from}
              <input type="hidden" name="from" value={data.from} />
            {/if}
            {#if data.to}
              <input type="hidden" name="to" value={data.to} />
            {/if}
            <input type="hidden" name="sortBy" value={data.sortBy} />
            <input type="hidden" name="sortDir" value={data.sortDir} />

            <div class="flex gap-2">
              <Button type="submit">Apply</Button>
              <Button href="/google-reviews/reviews" variant="outline"
                >Reset</Button
              >
            </div>
          </form>
        </div>
      </Card.Header>

      <Card.Content>
        <div class="mb-4 flex flex-wrap items-center gap-2">
          {#if data.businessQuery}
            <Badge variant="outline">Business: {data.businessQuery}</Badge>
          {/if}
          {#if data.businessCid}
            <Badge variant="outline">Business #{data.businessCid}</Badge>
          {/if}
          {#if data.rating}
            <Badge variant="outline">{data.rating} stars</Badge>
          {/if}
          {#if data.sentiment}
            <Badge variant="outline" class="capitalize"
              >{formatSentimentLabel(data.sentiment)}</Badge
            >
          {/if}
          {#if data.from || data.to}
            <Badge variant="outline">
              {data.from ?? "…"} – {data.to ?? "…"}
            </Badge>
          {/if}
          <span class="text-muted-foreground text-sm">
            {(page - 1) * pageSize + (totalItems === 0 ? 0 : 1)}-{Math.min(
              page * pageSize,
              totalItems,
            )} of {totalItems} reviews
          </span>
        </div>

        <div class="overflow-x-auto">
          <Table.Root>
            <Table.Header>
              <Table.Row>
                {#each sortableColumns as column (column.key)}
                  <Table.Head>
                    <a
                      href={getSortHref(column.key)}
                      class="hover:text-foreground inline-flex items-center gap-1"
                    >
                      {column.label}
                      {#if data.sortBy === column.key}
                        {#if data.sortDir === "asc"}
                          <ArrowUpIcon class="size-3.5" />
                        {:else}
                          <ArrowDownIcon class="size-3.5" />
                        {/if}
                      {/if}
                    </a>
                  </Table.Head>
                {/each}
                <Table.Head>Review</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {#if rows.length === 0}
                <Table.Row>
                  <Table.Cell
                    colspan={sortableColumns.length + 1}
                    class="text-muted-foreground py-8 text-center"
                  >
                    No reviews match the current filters.
                  </Table.Cell>
                </Table.Row>
              {:else}
                {#each rows as row (row.id)}
                  <Table.Row>
                    <Table.Cell class="text-muted-foreground whitespace-nowrap">
                      {formatGoogleReviewsDateTime(row.reviewDate)}
                    </Table.Cell>
                    <Table.Cell class="max-w-48">
                      {#if getBusinessHref(row)}
                        <a
                          href={getBusinessHref(row)}
                          class="block truncate hover:underline"
                        >
                          {row.businessTitle ?? row.businessCid}
                        </a>
                      {:else}
                        <span class="text-muted-foreground">—</span>
                      {/if}
                    </Table.Cell>
                    <Table.Cell class="max-w-40 truncate">
                      {row.reviewerName}
                    </Table.Cell>
                    <Table.Cell>
                      <span class="inline-flex items-center gap-1 tabular-nums">
                        {row.rating}
                        <StarIcon
                          class="size-3.5 fill-amber-400 text-amber-400"
                        />
                      </span>
                    </Table.Cell>
                    <Table.Cell>
                      {#if row.sentiment}
                        <Badge
                          variant="outline"
                          class={sentimentBadgeClass(row.sentiment)}
                        >
                          {formatSentimentLabel(row.sentiment)}
                        </Badge>
                      {:else}
                        <span class="text-muted-foreground">—</span>
                      {/if}
                    </Table.Cell>
                    <Table.Cell class="max-w-md">
                      <p
                        class="text-muted-foreground line-clamp-2 text-sm whitespace-normal"
                      >
                        {row.reviewText ?? "—"}
                      </p>
                    </Table.Cell>
                  </Table.Row>
                {/each}
              {/if}
            </Table.Body>
          </Table.Root>
        </div>

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
  </main>
</div>
