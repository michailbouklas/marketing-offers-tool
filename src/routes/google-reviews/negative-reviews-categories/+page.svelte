<script lang="ts">
  import { goto } from "$app/navigation";
  import DateRangeFilter from "$lib/components/date-range-filter.svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import * as NativeSelect from "$lib/components/ui/native-select/index.js";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import type {
    GoogleReviewsSortDirection,
    NegativeCategorySortField,
  } from "$lib/services/google-reviews/google-reviews";
  import ArrowDownIcon from "@lucide/svelte/icons/arrow-down";
  import ArrowUpIcon from "@lucide/svelte/icons/arrow-up";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import SearchIcon from "@lucide/svelte/icons/search";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
  let searchForm: HTMLFormElement | null = null;
  let searchDebounceTimeout: ReturnType<typeof setTimeout> | null = null;
  // svelte-ignore state_referenced_locally
  let trackedOnly = $state(data.trackedOnly);

  const categories = $derived(data.categories);

  const numberFormatter = new Intl.NumberFormat();

  $effect(() => {
    trackedOnly = data.trackedOnly;
  });

  const sortableColumns: { key: NegativeCategorySortField; label: string }[] = [
    { key: "category", label: "Category" },
    { key: "business_count", label: "Businesses" },
    { key: "negative_review_count", label: "Negative reviews" },
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

  function handleTrackedOnlyChange() {
    if (searchDebounceTimeout) {
      clearTimeout(searchDebounceTimeout);
      searchDebounceTimeout = null;
    }

    setTimeout(submitSearchForm, 0);
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
    business = data.businessQuery,
    cid = data.businessCid,
    rating = data.rating,
    from = data.from,
    to = data.to,
    sortBy = data.sortBy,
    sortDir = data.sortDir,
    trackedOnly = data.trackedOnly,
  }: {
    business?: string | null;
    cid?: string | null;
    rating?: number | null;
    from?: string | null;
    to?: string | null;
    sortBy?: NegativeCategorySortField;
    sortDir?: GoogleReviewsSortDirection;
    trackedOnly?: boolean;
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

    if (from) {
      params.set("from", from);
    }

    if (to) {
      params.set("to", to);
    }

    if (sortBy && sortBy !== "business_count") {
      params.set("sortBy", sortBy);
    }

    if (sortDir && sortDir !== "desc") {
      params.set("sortDir", sortDir);
    }

    if (trackedOnly) {
      params.set("trackedOnly", "true");
    }

    const search = params.toString();

    return search
      ? `/google-reviews/negative-reviews-categories?${search}`
      : "/google-reviews/negative-reviews-categories";
  }

  function getSortHref(column: NegativeCategorySortField) {
    const nextDir: GoogleReviewsSortDirection =
      data.sortBy === column && data.sortDir === "asc" ? "desc" : "asc";

    return getRouteHref({ sortBy: column, sortDir: nextDir });
  }

  function applyDateRange(range: { from?: string; to?: string }) {
    goto(
      getRouteHref({
        from: range.from ?? null,
        to: range.to ?? null,
      }),
    );
  }

  /** Drill down to the reviews of a category, scoped to negative sentiment and
   * carrying the page's current filters. */
  function getCategoryReviewsHref(categoryId: number) {
    const params = new URLSearchParams();
    params.set("categoryId", categoryId.toString());
    params.set("sentiment", "negative");

    if (data.businessQuery) {
      params.set("business", data.businessQuery);
    }

    if (data.businessCid) {
      params.set("cid", data.businessCid);
    }

    if (data.rating) {
      params.set("rating", data.rating.toString());
    }

    if (data.from) {
      params.set("from", data.from);
    }

    if (data.to) {
      params.set("to", data.to);
    }

    if (data.trackedOnly) {
      params.set("trackedOnly", "true");
    }

    return `/google-reviews/reviews?${params.toString()}`;
  }
</script>

<svelte:head>
  <title
    >Negative review categories | Google Reviews | Aggregator Offers Tool</title
  >
  <meta
    name="description"
    content="Topics driving negative Google reviews and how many businesses each one affects."
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
      <span>Negative review categories</span>
    </div>

    <section class="space-y-2">
      <h1 class="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
        Negative review categories
      </h1>
      <p class="text-muted-foreground max-w-3xl text-base leading-7">
        The topics behind negative Google reviews, and how many businesses each
        one affects. Select a category to read its negative reviews.
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
              Categories
            </Card.Title>
            <Card.Description>
              {numberFormatter.format(categories.length)} categor{categories.length ===
              1
                ? "y"
                : "ies"} from negative reviews.
            </Card.Description>
          </div>

          <form
            method="GET"
            bind:this={searchForm}
            class="grid gap-3 lg:grid-cols-[minmax(0,15rem)_minmax(0,8rem)_auto_auto_auto] lg:items-end"
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
              <span class="text-sm font-medium">Review date</span>
              <DateRangeFilter
                from={data.from}
                to={data.to}
                onApply={applyDateRange}
              />
            </div>

            <div
              class="border-border bg-muted/30 flex min-h-10 items-center justify-between gap-3 rounded-md border px-3 py-2"
            >
              <label
                class="cursor-pointer text-sm font-medium whitespace-nowrap"
                for="trackedOnly"
              >
                Tracked only
              </label>
              <Switch
                id="trackedOnly"
                type="button"
                bind:checked={trackedOnly}
                onclick={handleTrackedOnlyChange}
                aria-label="Show tracked businesses only"
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
            {#if trackedOnly}
              <input type="hidden" name="trackedOnly" value="true" />
            {/if}
            <input type="hidden" name="sortBy" value={data.sortBy} />
            <input type="hidden" name="sortDir" value={data.sortDir} />

            <div class="flex gap-2">
              <Button type="submit">Apply</Button>
              <Button
                href="/google-reviews/negative-reviews-categories"
                variant="outline">Reset</Button
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
          {#if data.from || data.to}
            <Badge variant="outline">
              {data.from ?? "…"} – {data.to ?? "…"}
            </Badge>
          {/if}
          {#if data.trackedOnly}
            <Badge variant="outline">Tracked only</Badge>
          {/if}
        </div>

        <div class="overflow-x-auto">
          <Table.Root>
            <Table.Header>
              <Table.Row>
                {#each sortableColumns as column (column.key)}
                  <Table.Head
                    class={column.key === "category" ? "" : "text-right"}
                  >
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
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {#if categories.length === 0}
                <Table.Row>
                  <Table.Cell
                    colspan={sortableColumns.length}
                    class="text-muted-foreground py-8 text-center"
                  >
                    No negative-review categories match the current filters.
                  </Table.Cell>
                </Table.Row>
              {:else}
                {#each categories as category (category.categoryId)}
                  <Table.Row>
                    <Table.Cell class="font-medium">
                      <a
                        href={getCategoryReviewsHref(category.categoryId)}
                        class="capitalize hover:underline"
                      >
                        {category.category}
                      </a>
                    </Table.Cell>
                    <Table.Cell class="text-right tabular-nums">
                      {numberFormatter.format(category.businessCount)}
                    </Table.Cell>
                    <Table.Cell class="text-right tabular-nums">
                      {numberFormatter.format(category.negativeReviewCount)}
                    </Table.Cell>
                  </Table.Row>
                {/each}
              {/if}
            </Table.Body>
          </Table.Root>
        </div>
      </Card.Content>
    </Card.Root>
  </main>
</div>
