<script lang="ts">
  import { enhance } from "$app/forms";
  import MonitorToggleButton from "$lib/components/competition/monitor-toggle-button.svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import * as NativeSelect from "$lib/components/ui/native-select/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import type {
    CompetitionSortDirection,
    RestaurantSortField,
  } from "$lib/services/competition/competition";
  import ArrowDownIcon from "@lucide/svelte/icons/arrow-down";
  import ArrowUpIcon from "@lucide/svelte/icons/arrow-up";
  import BellIcon from "@lucide/svelte/icons/bell";
  import BellOffIcon from "@lucide/svelte/icons/bell-off";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import FilterIcon from "@lucide/svelte/icons/filter";
  import SearchIcon from "@lucide/svelte/icons/search";
  import StarIcon from "@lucide/svelte/icons/star";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
  let searchForm: HTMLFormElement | null = null;
  let searchDebounceTimeout: ReturnType<typeof setTimeout> | null = null;

  const rows = $derived(data.restaurantsPage.items);
  const page = $derived(data.restaurantsPage.page);
  const pageSize = $derived(data.restaurantsPage.pageSize);
  const totalItems = $derived(data.restaurantsPage.totalItems);
  const totalPages = $derived(data.restaurantsPage.totalPages);

  const sortableColumns: { key: RestaurantSortField; label: string }[] = [
    { key: "name", label: "Restaurant" },
    { key: "processor_name", label: "Aggregator" },
    { key: "rating", label: "Rating" },
    { key: "active_offer_count", label: "Active offers" },
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
    processorId = data.selectedProcessorId,
    query = data.query,
    sortBy = data.sortBy,
    sortDir = data.sortDir,
  }: {
    page?: number;
    processorId?: number | null;
    query?: string | null;
    sortBy?: RestaurantSortField;
    sortDir?: CompetitionSortDirection;
  }) {
    const params = new URLSearchParams();

    if (processorId) {
      params.set("processorId", processorId.toString());
    }

    if (query) {
      params.set("query", query);
    }

    if (sortBy && sortBy !== "name") {
      params.set("sortBy", sortBy);
    }

    if (sortDir && sortDir !== "asc") {
      params.set("sortDir", sortDir);
    }

    if (page && page > 1) {
      params.set("page", page.toString());
    }

    const search = params.toString();

    return search
      ? `/competition/restaurants?${search}`
      : "/competition/restaurants";
  }

  function getPageHref(targetPage: number) {
    return getRouteHref({ page: targetPage });
  }

  function getSortHref(column: RestaurantSortField) {
    const nextDir: CompetitionSortDirection =
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

  function getDetailHref(row: (typeof rows)[number]) {
    return `/competition/restaurants/${row.id}?processor=${row.processorId}`;
  }

  // Tracked → ignored → untracked → tracked.
  function getNextTrackState(current: "tracked" | "ignored" | null) {
    if (current === "tracked") {
      return "ignored";
    }

    if (current === "ignored") {
      return "";
    }

    return "tracked";
  }
</script>

<svelte:head>
  <title>Restaurants | Competition | Aggregator Offers Tool</title>
  <meta
    name="description"
    content="All scraped competitor restaurants across aggregators, with tracking preferences."
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
      <span>Restaurants</span>
    </div>

    <section class="space-y-2">
      <h1 class="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
        Restaurants
      </h1>
      <p class="text-muted-foreground max-w-3xl text-base leading-7">
        Every competitor store the scraper monitors. Track the ones you care
        about — tracked restaurants will drive your dashboard alerts.
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
              Restaurants
            </Card.Title>
            <Card.Description>
              Showing page {page} of {totalPages} with {pageSize} rows per page.
            </Card.Description>
          </div>

          <form
            method="GET"
            bind:this={searchForm}
            class="grid gap-3 lg:grid-cols-[minmax(0,18rem)_minmax(0,13rem)_auto] lg:items-end"
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

            <input type="hidden" name="sortBy" value={data.sortBy} />
            <input type="hidden" name="sortDir" value={data.sortDir} />

            <div class="flex gap-2">
              <Button type="submit">Apply</Button>
              <Button href="/competition/restaurants" variant="outline"
                >Reset</Button
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
          {#if data.query}
            <Badge variant="outline">Search: {data.query}</Badge>
          {/if}
          <span class="text-muted-foreground text-sm">
            {(page - 1) * pageSize + (totalItems === 0 ? 0 : 1)}-{Math.min(
              page * pageSize,
              totalItems,
            )} of {totalItems} restaurants
          </span>
        </div>

        <div class="overflow-x-auto">
          <Table.Root>
            <Table.Header>
              <Table.Row>
                <Table.Head class="w-12"></Table.Head>
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
                <Table.Head>Delivery</Table.Head>
                <Table.Head class="w-12"></Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {#if rows.length === 0}
                <Table.Row>
                  <Table.Cell
                    colspan={sortableColumns.length + 3}
                    class="text-muted-foreground py-8 text-center"
                  >
                    No restaurants match the current filters.
                  </Table.Cell>
                </Table.Row>
              {:else}
                {#each rows as row (`${row.processorId}:${row.id}`)}
                  <Table.Row>
                    <Table.Cell>
                      <form method="POST" action="?/toggleTrack" use:enhance>
                        <input
                          type="hidden"
                          name="processorId"
                          value={row.processorId}
                        />
                        <input
                          type="hidden"
                          name="restaurantId"
                          value={row.id}
                        />
                        <input
                          type="hidden"
                          name="state"
                          value={getNextTrackState(row.trackState)}
                        />
                        <Tooltip.Provider>
                          <Tooltip.Root>
                            <Tooltip.Trigger>
                              {#snippet child({ props })}
                                <Button
                                  {...props}
                                  type="submit"
                                  variant="ghost"
                                  size="icon"
                                  class="size-8"
                                >
                                  {#if row.trackState === "tracked"}
                                    <StarIcon
                                      class="size-4 fill-amber-400 text-amber-400"
                                    />
                                  {:else if row.trackState === "ignored"}
                                    <BellOffIcon
                                      class="text-muted-foreground size-4"
                                    />
                                  {:else}
                                    <BellIcon
                                      class="text-muted-foreground size-4"
                                    />
                                  {/if}
                                </Button>
                              {/snippet}
                            </Tooltip.Trigger>
                            <Tooltip.Content>
                              {#if row.trackState === "tracked"}
                                Tracked — click to ignore
                              {:else if row.trackState === "ignored"}
                                Ignored — click to clear
                              {:else}
                                Not tracked — click to track
                              {/if}
                            </Tooltip.Content>
                          </Tooltip.Root>
                        </Tooltip.Provider>
                      </form>
                    </Table.Cell>
                    <Table.Cell class="max-w-64">
                      <a
                        href={getDetailHref(row)}
                        class="block truncate font-medium hover:underline"
                      >
                        {row.name}
                      </a>
                    </Table.Cell>
                    <Table.Cell class="capitalize">
                      {row.processorName ?? "—"}
                    </Table.Cell>
                    <Table.Cell class="tabular-nums">
                      {#if row.rating !== null}
                        {row.rating}
                        {#if row.ratingCount !== null}
                          <span class="text-muted-foreground text-xs">
                            ({row.ratingCount})
                          </span>
                        {/if}
                      {:else}
                        —
                      {/if}
                    </Table.Cell>
                    <Table.Cell class="tabular-nums">
                      {row.activeOfferCount}
                    </Table.Cell>
                    <Table.Cell
                      class="text-muted-foreground max-w-48 truncate text-sm"
                    >
                      {row.deliveryInfo || "—"}
                    </Table.Cell>
                    <Table.Cell>
                      <MonitorToggleButton
                        entityId={`${row.processorId}:${row.id}`}
                        isMonitored={row.isMonitored}
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
