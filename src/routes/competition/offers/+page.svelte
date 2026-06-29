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
  import {
    formatCompetitionDateTime,
    formatCompetitionMoney,
    type CompetitionSortDirection,
    type OfferSortField,
  } from "$lib/services/competition/competition";
  import ArrowDownIcon from "@lucide/svelte/icons/arrow-down";
  import ArrowUpIcon from "@lucide/svelte/icons/arrow-up";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import FilterIcon from "@lucide/svelte/icons/filter";
  import SearchIcon from "@lucide/svelte/icons/search";
  import XIcon from "@lucide/svelte/icons/x";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
  let searchForm: HTMLFormElement | null = null;
  let searchDebounceTimeout: ReturnType<typeof setTimeout> | null = null;
  // svelte-ignore state_referenced_locally
  let trackedOnly = $state(data.trackedOnly);

  const rows = $derived(data.offersPage.items);
  const page = $derived(data.offersPage.page);
  const pageSize = $derived(data.offersPage.pageSize);
  const totalItems = $derived(data.offersPage.totalItems);
  const totalPages = $derived(data.offersPage.totalPages);

  $effect(() => {
    trackedOnly = data.trackedOnly;
  });

  const sortableColumns: { key: OfferSortField; label: string }[] = [
    { key: "name", label: "Offer" },
    { key: "restaurant_name", label: "Restaurant" },
    { key: "processor_name", label: "Aggregator" },
    { key: "price", label: "Price" },
    { key: "first_seen", label: "First seen" },
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
    page,
    processorId = data.selectedProcessorId,
    brandId = data.brandId,
    restaurant = data.restaurantQuery,
    from = data.from,
    to = data.to,
    sortBy = data.sortBy,
    sortDir = data.sortDir,
    trackedOnly = data.trackedOnly,
  }: {
    page?: number;
    processorId?: number | null;
    brandId?: number | null;
    restaurant?: string | null;
    from?: string | null;
    to?: string | null;
    sortBy?: OfferSortField;
    sortDir?: CompetitionSortDirection;
    trackedOnly?: boolean;
  }) {
    const params = new URLSearchParams();

    if (processorId) {
      params.set("processorId", processorId.toString());
    }

    if (brandId) {
      params.set("brandId", brandId.toString());
    }

    if (restaurant) {
      params.set("restaurant", restaurant);
    }

    if (from) {
      params.set("from", from);
    }

    if (to) {
      params.set("to", to);
    }

    if (sortBy && sortBy !== "first_seen") {
      params.set("sortBy", sortBy);
    }

    if (sortDir && sortDir !== "desc") {
      params.set("sortDir", sortDir);
    }

    if (trackedOnly) {
      params.set("trackedOnly", "true");
    }

    if (page && page > 1) {
      params.set("page", page.toString());
    }

    const search = params.toString();

    return search ? `/competition/offers?${search}` : "/competition/offers";
  }

  function getPageHref(targetPage: number) {
    return getRouteHref({ page: targetPage });
  }

  function getSortHref(column: OfferSortField) {
    const nextDir: CompetitionSortDirection =
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

  function getActiveProcessorName() {
    if (!data.selectedProcessorId) {
      return "All aggregators";
    }

    return (
      data.processors.find(
        (processor) => processor.id === data.selectedProcessorId,
      )?.name ?? `Processor #${data.selectedProcessorId}`
    );
  }

  function getRestaurantHref(row: (typeof rows)[number]) {
    return `/competition/restaurants/${row.restaurantId}?processor=${row.processorId}`;
  }
</script>

<svelte:head>
  <title>Active Offers | Competition | Aggregator Offers Tool</title>
  <meta
    name="description"
    content="All active competitor offers across aggregators, filterable by platform, restaurant, and time."
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
      <a href="/competition" class="hover:text-foreground transition-colors"
        >Competition</a
      >
      <ChevronRightIcon class="size-3" />
      <span>Active offers</span>
    </div>

    <section
      class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"
    >
      <div class="space-y-2">
        <h1 class="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
          Active offers
        </h1>
        <p class="text-muted-foreground max-w-3xl text-base leading-7">
          Every offer competitors are currently running, with the platform,
          restaurant, and price details the scraper captured.
        </p>
      </div>

      {#if data.canViewScrapeSessions}
        <Button href="/competition/offers/scrape-sessions" variant="outline">
          Scrape sessions
        </Button>
      {/if}
    </section>

    <Card.Root
      class="border-border/70 bg-background/90 overflow-hidden shadow-sm backdrop-blur"
    >
      <Card.Header>
        <div
          class="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between"
        >
          <div class="space-y-1">
            <Card.Title class="text-2xl tracking-[-0.03em]">Offers</Card.Title>
            <Card.Description>
              Showing page {page} of {totalPages} with {pageSize} rows per page.
            </Card.Description>
          </div>

          <form
            method="GET"
            bind:this={searchForm}
            class="grid gap-3 lg:grid-cols-[minmax(0,16rem)_minmax(0,13rem)_minmax(0,13rem)_auto_auto_auto] lg:items-end"
          >
            <div class="space-y-2">
              <label class="text-sm font-medium" for="restaurant"
                >Restaurant</label
              >
              <div class="relative">
                <SearchIcon
                  class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                />
                <Input
                  id="restaurant"
                  name="restaurant"
                  value={data.restaurantQuery ?? ""}
                  placeholder="Restaurant name"
                  class="pl-9"
                  oninput={handleSearchInput}
                  onkeydown={handleSearchKeydown}
                />
              </div>
            </div>

            <div class="space-y-2">
              <label class="text-sm font-medium" for="processorId"
                >Aggregator</label
              >
              <div class="relative">
                <FilterIcon
                  class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                />
                <NativeSelect.Root
                  id="processorId"
                  name="processorId"
                  value={data.selectedProcessorId?.toString() ?? ""}
                  class="pl-9 capitalize"
                  onchange={handleSearchChange}
                >
                  <NativeSelect.Option value=""
                    >All aggregators</NativeSelect.Option
                  >
                  {#each data.processors as processor (processor.id)}
                    <NativeSelect.Option value={processor.id.toString()}>
                      {processor.name}
                    </NativeSelect.Option>
                  {/each}
                </NativeSelect.Root>
              </div>
            </div>

            <div class="space-y-2">
              <label class="text-sm font-medium" for="brandId">Brand</label>
              <NativeSelect.Root
                id="brandId"
                name="brandId"
                value={data.brandId?.toString() ?? ""}
                onchange={handleSearchChange}
              >
                <NativeSelect.Option value="">All brands</NativeSelect.Option>
                {#each data.brands as brand (brand.id)}
                  <NativeSelect.Option value={brand.id.toString()}>
                    {brand.name}
                  </NativeSelect.Option>
                {/each}
              </NativeSelect.Root>
            </div>

            <div class="space-y-2">
              <span class="text-sm font-medium">First seen</span>
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
                aria-label="Show tracked restaurants only"
              />
            </div>

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
              <Button href="/competition/offers" variant="outline">Reset</Button
              >
            </div>
          </form>
        </div>
      </Card.Header>

      <Card.Content>
        <div class="mb-4 flex flex-wrap items-center gap-2">
          <Badge variant="secondary" class="capitalize"
            >{getActiveProcessorName()}</Badge
          >
          {#if data.restaurantQuery}
            <Badge variant="outline">Restaurant: {data.restaurantQuery}</Badge>
          {/if}
          {#if data.brandId}
            <Badge variant="outline" class="gap-1">
              Brand: {data.brandName ?? `#${data.brandId}`}
              <a
                href={getRouteHref({ page: 1, brandId: null })}
                class="hover:text-foreground -mr-1 inline-flex"
                aria-label="Clear brand filter"
              >
                <XIcon class="size-3" />
              </a>
            </Badge>
          {/if}
          {#if data.from || data.to}
            <Badge variant="outline">
              {data.from ?? "…"} – {data.to ?? "…"}
            </Badge>
          {/if}
          {#if data.trackedOnly}
            <Badge variant="outline">Tracked only</Badge>
          {/if}
          <span class="text-muted-foreground text-sm">
            {(page - 1) * pageSize + (totalItems === 0 ? 0 : 1)}-{Math.min(
              page * pageSize,
              totalItems,
            )} of {totalItems} offers
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
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {#if rows.length === 0}
                <Table.Row>
                  <Table.Cell
                    colspan={sortableColumns.length}
                    class="text-muted-foreground py-8 text-center"
                  >
                    No active offers match the current filters.
                  </Table.Cell>
                </Table.Row>
              {:else}
                {#each rows as row (row.id)}
                  <Table.Row>
                    <Table.Cell class="max-w-72">
                      <p class="truncate font-medium">{row.name}</p>
                      {#if row.description}
                        <p class="text-muted-foreground truncate text-xs">
                          {row.description}
                        </p>
                      {/if}
                    </Table.Cell>
                    <Table.Cell class="max-w-48">
                      <a
                        href={getRestaurantHref(row)}
                        class="block truncate hover:underline"
                      >
                        {row.restaurantName ??
                          `Restaurant #${row.restaurantId}`}
                      </a>
                    </Table.Cell>
                    <Table.Cell class="capitalize">
                      {row.processorName ?? "—"}
                    </Table.Cell>
                    <Table.Cell class="tabular-nums">
                      {formatCompetitionMoney(row.price, row.currency)}
                    </Table.Cell>
                    <Table.Cell class="text-muted-foreground whitespace-nowrap">
                      {formatCompetitionDateTime(row.firstSeen)}
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
