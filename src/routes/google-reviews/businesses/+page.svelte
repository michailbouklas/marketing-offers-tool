<script lang="ts">
  import MonitorToggleButton from "$lib/components/competition/monitor-toggle-button.svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import * as NativeSelect from "$lib/components/ui/native-select/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import {
    formatRating,
    formatSentimentLabel,
    sentimentValues,
    type BusinessSortField,
    type GoogleReviewsSortDirection,
    type SentimentValue,
  } from "$lib/services/google-reviews/google-reviews";
  import ArrowDownIcon from "@lucide/svelte/icons/arrow-down";
  import ArrowUpIcon from "@lucide/svelte/icons/arrow-up";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import FilterIcon from "@lucide/svelte/icons/filter";
  import SearchIcon from "@lucide/svelte/icons/search";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
  let searchForm: HTMLFormElement | null = null;
  let searchDebounceTimeout: ReturnType<typeof setTimeout> | null = null;

  const rows = $derived(data.businessesPage.items);
  const page = $derived(data.businessesPage.page);
  const pageSize = $derived(data.businessesPage.pageSize);
  const totalItems = $derived(data.businessesPage.totalItems);
  const totalPages = $derived(data.businessesPage.totalPages);

  const numberFormatter = new Intl.NumberFormat();

  const sortableColumns: { key: BusinessSortField; label: string }[] = [
    { key: "title", label: "Business" },
    { key: "category", label: "Category" },
    { key: "average_rating", label: "Avg rating" },
    { key: "review_count", label: "Reviews" },
    { key: "negative_count", label: "Negative" },
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
    query = data.query,
    stars = data.stars,
    sentiment = data.sentiment,
    sortBy = data.sortBy,
    sortDir = data.sortDir,
  }: {
    page?: number;
    query?: string | null;
    stars?: number | null;
    sentiment?: SentimentValue | null;
    sortBy?: BusinessSortField;
    sortDir?: GoogleReviewsSortDirection;
  }) {
    const params = new URLSearchParams();

    if (query) {
      params.set("query", query);
    }

    if (stars) {
      params.set("stars", stars.toString());
    }

    if (sentiment) {
      params.set("sentiment", sentiment);
    }

    if (sortBy && sortBy !== "review_count") {
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
      ? `/google-reviews/businesses?${search}`
      : "/google-reviews/businesses";
  }

  function getPageHref(targetPage: number) {
    return getRouteHref({ page: targetPage });
  }

  function getSortHref(column: BusinessSortField) {
    const nextDir: GoogleReviewsSortDirection =
      data.sortBy === column && data.sortDir === "asc" ? "desc" : "asc";

    return getRouteHref({ page: 1, sortBy: column, sortDir: nextDir });
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

  function getDetailHref(row: (typeof rows)[number]) {
    return `/google-reviews/businesses/${row.cid}`;
  }
</script>

<svelte:head>
  <title>Businesses | Google Reviews | Aggregator Offers Tool</title>
  <meta
    name="description"
    content="All scraped Google businesses with their review counts, ratings, and sentiment breakdown."
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
      <span>Businesses</span>
    </div>

    <section class="space-y-2">
      <h1 class="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
        Businesses
      </h1>
      <p class="text-muted-foreground max-w-3xl text-base leading-7">
        Every business the scraper monitors on Google Maps, with its review
        volume, average rating, and sentiment breakdown.
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
            <Card.Title class="text-2xl tracking-[-0.03em]">
              Businesses
            </Card.Title>
            <Card.Description>
              Showing page {page} of {totalPages} with {pageSize} rows per page.
            </Card.Description>
          </div>

          <form
            method="GET"
            bind:this={searchForm}
            class="grid gap-3 lg:grid-cols-[minmax(0,16rem)_minmax(0,8rem)_minmax(0,10rem)_auto] lg:items-end"
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
                  placeholder="Business name"
                  class="pl-9"
                  oninput={handleSearchInput}
                  onkeydown={handleSearchKeydown}
                />
              </div>
            </div>

            <div class="space-y-2">
              <label class="text-sm font-medium" for="stars">Stars</label>
              <NativeSelect.Root
                id="stars"
                name="stars"
                value={data.stars?.toString() ?? ""}
                onchange={handleSearchChange}
              >
                <NativeSelect.Option value="">All</NativeSelect.Option>
                {#each [1, 2, 3, 4, 5] as stars (stars)}
                  <NativeSelect.Option value={stars.toString()}>
                    {stars}★ – {stars}.9★
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
                      Mostly {formatSentimentLabel(sentiment)}
                    </NativeSelect.Option>
                  {/each}
                </NativeSelect.Root>
              </div>
            </div>

            <input type="hidden" name="sortBy" value={data.sortBy} />
            <input type="hidden" name="sortDir" value={data.sortDir} />

            <div class="flex gap-2">
              <Button type="submit">Apply</Button>
              <Button href="/google-reviews/businesses" variant="outline"
                >Reset</Button
              >
            </div>
          </form>
        </div>
      </Card.Header>

      <Card.Content>
        <div class="mb-4 flex flex-wrap items-center gap-2">
          {#if data.query}
            <Badge variant="outline">Search: {data.query}</Badge>
          {/if}
          {#if data.stars}
            <Badge variant="outline">{data.stars}★ bucket</Badge>
          {/if}
          {#if data.sentiment}
            <Badge variant="outline">
              Mostly {formatSentimentLabel(data.sentiment)}
            </Badge>
          {/if}
          <span class="text-muted-foreground text-sm">
            {(page - 1) * pageSize + (totalItems === 0 ? 0 : 1)}-{Math.min(
              page * pageSize,
              totalItems,
            )} of {totalItems} businesses
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
                <Table.Head>Sentiment</Table.Head>
                <Table.Head class="w-12"></Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {#if rows.length === 0}
                <Table.Row>
                  <Table.Cell
                    colspan={sortableColumns.length + 2}
                    class="text-muted-foreground py-8 text-center"
                  >
                    No businesses match the current filters.
                  </Table.Cell>
                </Table.Row>
              {:else}
                {#each rows as row (row.cid)}
                  <Table.Row>
                    <Table.Cell class="max-w-64">
                      <a
                        href={getDetailHref(row)}
                        class="block truncate font-medium hover:underline"
                      >
                        {row.title}
                      </a>
                      {#if row.address}
                        <p class="text-muted-foreground truncate text-xs">
                          {row.address}
                        </p>
                      {/if}
                    </Table.Cell>
                    <Table.Cell class="max-w-40 truncate">
                      {row.category ?? "—"}
                    </Table.Cell>
                    <Table.Cell class="tabular-nums">
                      {formatRating(row.averageRating)}
                    </Table.Cell>
                    <Table.Cell class="tabular-nums">
                      {numberFormatter.format(row.reviewCount)}
                    </Table.Cell>
                    <Table.Cell class="tabular-nums">
                      {numberFormatter.format(row.negativeCount)}
                    </Table.Cell>
                    <Table.Cell>
                      {#if row.positiveCount + row.neutralCount + row.negativeCount > 0}
                        <div class="flex items-center gap-2">
                          <div
                            class="bg-muted flex h-2 w-28 overflow-hidden rounded-full"
                          >
                            {#each [{ count: row.positiveCount, class: "bg-emerald-500" }, { count: row.neutralCount, class: "bg-zinc-400" }, { count: row.negativeCount, class: "bg-red-500" }] as segment, index (index)}
                              {#if segment.count > 0}
                                <div
                                  class="h-full {segment.class}"
                                  style="width: {(segment.count /
                                    (row.positiveCount +
                                      row.neutralCount +
                                      row.negativeCount)) *
                                    100}%"
                                ></div>
                              {/if}
                            {/each}
                          </div>
                          <span
                            class="text-muted-foreground text-xs tabular-nums"
                          >
                            {row.positiveCount}/{row.neutralCount}/{row.negativeCount}
                          </span>
                        </div>
                      {:else}
                        <span class="text-muted-foreground text-sm"
                          >Not analyzed</span
                        >
                      {/if}
                    </Table.Cell>
                    <Table.Cell>
                      <MonitorToggleButton
                        entityId={row.cid}
                        isMonitored={row.isMonitored === true}
                      />
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
