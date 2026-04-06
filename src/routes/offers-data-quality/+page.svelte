<script lang="ts">
  import ArrowDownIcon from "@lucide/svelte/icons/arrow-down";
  import ArrowUpIcon from "@lucide/svelte/icons/arrow-up";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import ChevronsLeftRightEllipsisIcon from "@lucide/svelte/icons/chevrons-left-right-ellipsis";
  import ChevronsUpDownIcon from "@lucide/svelte/icons/chevrons-up-down";
  import XIcon from "@lucide/svelte/icons/x";
  import { toast } from "svelte-sonner";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button, buttonVariants } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import { fetchGapQueue } from "$lib/services/offers-data-quality-list";
  import type {
    GapListItem,
    GapListPage,
  } from "$lib/services/offers-data-quality";
  import type {
    GapListSortDirection,
    GapListSortField,
  } from "$lib/services/offers-data-quality";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
  let brandFilterOpen = $state(false);
  let selectedAliases = $state<string[]>([]);
  let appliedAliases = $state<string[]>([]);
  let queuePage = $state<GapListPage>({
    items: [],
    totalItems: 0,
    page: 1,
    pageSize: 50,
    totalPages: 1,
  });
  let currentSortBy = $state<GapListSortField>("brand");
  let currentSortDir = $state<GapListSortDirection>("asc");
  let isRefreshing = $state(false);
  let latestRefreshRequestId = 0;

  const gaps = $derived(queuePage.items);
  const brands = $derived(data.brands);
  const page = $derived(queuePage.page);
  const pageSize = $derived(queuePage.pageSize);
  const totalItems = $derived(queuePage.totalItems);
  const totalPages = $derived(queuePage.totalPages);
  const sortBy = $derived(currentSortBy);
  const sortDir = $derived(currentSortDir);
  const selectedBrandAliases = $derived(new Set(selectedAliases));
  const appliedBrandAliases = $derived(new Set(appliedAliases));

  const sortableColumns: Array<{
    label: string;
    column: GapListSortField;
    className?: string;
  }> = [
    { label: "Item", column: "item_name" },
    { label: "Brand", column: "brand" },
    { label: "Transaction category", column: "item_category" },
    { label: "Missing fields", column: "missing_fields" },
    { label: "Status", column: "status" },
    { label: "Detected", column: "detected_at" },
  ];

  $effect(() => {
    selectedAliases = [...data.selectedBrandAliases];
    appliedAliases = [...data.selectedBrandAliases];
    queuePage = data.gapsPage;
    currentSortBy = data.sortBy;
    currentSortDir = data.sortDir;
  });

  function getBrandFilterSummary() {
    if (appliedAliases.length === brands.length) {
      return "All your assigned brands";
    }

    if (appliedAliases.length === 0) {
      return "No brands selected";
    }

    return `${appliedAliases.length} brands selected`;
  }

  function isBrandSelected(alias: string) {
    return selectedBrandAliases.has(alias);
  }

  function toggleBrand(alias: string) {
    if (isBrandSelected(alias)) {
      selectedAliases = selectedAliases.filter((value) => value !== alias);
      return;
    }

    selectedAliases = [...selectedAliases, alias];
  }

  function selectAllBrands() {
    selectedAliases = brands.map((brand) => brand.alias);
  }

  function clearAllBrands() {
    selectedAliases = [];
  }

  async function refreshQueue({
    aliases = appliedAliases,
    nextSortBy = currentSortBy,
    nextSortDir = currentSortDir,
    nextPage = page,
  }: {
    aliases?: string[];
    nextSortBy?: GapListSortField;
    nextSortDir?: GapListSortDirection;
    nextPage?: number;
  } = {}) {
    const requestId = ++latestRefreshRequestId;

    isRefreshing = true;

    try {
      const result = await fetchGapQueue(fetch, {
        brandAliases: aliases,
        page: nextPage,
        sortBy: nextSortBy,
        sortDir: nextSortDir,
      });

      if (requestId !== latestRefreshRequestId) {
        return;
      }

      queuePage = result.gapsPage;
      appliedAliases = [...result.selectedBrandAliases];
      selectedAliases = [...result.selectedBrandAliases];
      currentSortBy = result.sortBy;
      currentSortDir = result.sortDir;
    } catch (error) {
      if (requestId !== latestRefreshRequestId) {
        return;
      }

      toast.error(
        error instanceof Error ? error.message : "Unable to refresh the queue.",
      );
    } finally {
      if (requestId === latestRefreshRequestId) {
        isRefreshing = false;
      }
    }
  }

  async function dismissBrand(alias: string) {
    const nextAliases = appliedAliases.filter((value) => value !== alias);

    selectedAliases = nextAliases;
    appliedAliases = nextAliases;
    await refreshQueue({ aliases: nextAliases, nextPage: 1 });
  }

  async function applyBrandFilters() {
    brandFilterOpen = false;
    appliedAliases = [...selectedAliases];
    await refreshQueue({ aliases: selectedAliases, nextPage: 1 });
  }

  async function resetBrandFilters() {
    const allAliases = brands.map((brand) => brand.alias);

    brandFilterOpen = false;
    selectedAliases = allAliases;
    appliedAliases = allAliases;
    await refreshQueue({ aliases: allAliases, nextPage: 1 });
  }

  function getNextSortDirection(
    column: GapListSortField,
  ): GapListSortDirection {
    return sortBy === column && sortDir === "asc" ? "desc" : "asc";
  }

  async function handleSort(column: GapListSortField) {
    await refreshQueue({
      aliases: appliedAliases,
      nextSortBy: column,
      nextSortDir: getNextSortDirection(column),
      nextPage: 1,
    });
  }

  function isActiveSort(column: GapListSortField) {
    return sortBy === column;
  }

  function getGapRowKey(gap: GapListItem, index: number) {
    return [
      gap.dq_id,
      gap.trde_item,
      gap.brand,
      gap.status,
      gap.detected_at,
      index,
    ].join(":");
  }

  async function goToPage(targetPage: number) {
    if (targetPage < 1 || targetPage > totalPages || targetPage === page) {
      return;
    }

    await refreshQueue({ aliases: appliedAliases, nextPage: targetPage });
  }
</script>

<svelte:head>
  <title>Open Gaps | Aggregator Offers Tool</title>
  <meta
    name="description"
    content="Review open and submitted pricing data gaps that need action."
  />
</svelte:head>

<div class="relative isolate min-h-screen overflow-hidden">
  <div class="bg-background absolute inset-0 -z-20"></div>
  <div
    class="absolute inset-x-0 top-0 -z-10 h-[24rem] bg-[radial-gradient(circle_at_top_left,_color-mix(in_oklab,var(--color-chart-2)_18%,transparent),transparent_34%),radial-gradient(circle_at_88%_14%,_color-mix(in_oklab,var(--color-chart-1)_18%,transparent),transparent_26%)]"
  ></div>

  <main class="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
    <div
      class="flex flex-wrap items-center gap-2 text-xs tracking-[0.18em] text-zinc-500 uppercase"
    >
      <span>Gap list</span>
      <ChevronRightIcon class="size-3" />
      <span>Open gaps</span>
    </div>

    <section class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-end">
      <div class="space-y-3">
        <Badge
          variant="outline"
          class="px-3 py-1 text-[0.7rem] tracking-[0.22em] uppercase"
        >
          Discount quality system
        </Badge>
        <div class="space-y-2">
          <h1 class="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
            Open pricing gaps
          </h1>
          <p class="text-muted-foreground max-w-3xl text-base leading-7">
            Review unresolved pricing issues and open the structured entry form
            for each item.
          </p>
        </div>
      </div>

      <Card.Root
        class="border-border/70 bg-background/90 shadow-sm backdrop-blur"
      >
        <Card.Content class="p-5">
          <p class="text-3xl font-semibold tracking-[-0.04em]">
            {totalItems}
          </p>
          <p class="text-muted-foreground mt-1 text-sm">
            Open or submitted gaps
          </p>
        </Card.Content>
      </Card.Root>
    </section>

    <Card.Root
      class="border-border/70 bg-background/90 overflow-hidden shadow-sm backdrop-blur"
    >
      <Card.Header>
        <Card.Title class="text-2xl tracking-[-0.03em]">Gap queue</Card.Title>
        <Card.Description>
          Showing page {page} of {totalPages}. Submitted gaps stay visible so
          approvers can track their current state.
          {#if isRefreshing}
            Refreshing...
          {/if}
        </Card.Description>
      </Card.Header>
      <Card.Content>
        <div
          class="mb-6 flex flex-col gap-3 rounded-2xl border border-dashed px-4 py-4 sm:px-5"
        >
          <div
            class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p class="text-sm font-medium">Brand filter</p>
              <p class="text-muted-foreground text-sm">
                {getBrandFilterSummary()}
              </p>
            </div>

            <div class="flex flex-wrap items-center gap-2">
              <Popover.Root bind:open={brandFilterOpen}>
                <Popover.Trigger
                  class={`${buttonVariants({ variant: "outline" })} min-w-52 justify-between`}
                >
                  <span class="truncate">{getBrandFilterSummary()}</span>
                  <ChevronsUpDownIcon class="size-4 opacity-60" />
                </Popover.Trigger>

                <Popover.Content align="end" class="w-[22rem] p-0">
                  <div class="flex flex-col">
                    <div class="border-b px-4 py-3">
                      <p class="text-sm font-medium">Choose brands</p>
                      <p class="text-muted-foreground mt-1 text-xs">
                        Only your assigned brands appear here.
                      </p>
                    </div>

                    <div
                      class="flex items-center justify-between gap-2 border-b px-4 py-2"
                    >
                      <button
                        type="button"
                        class="text-sm font-medium underline-offset-4 hover:underline"
                        onclick={selectAllBrands}
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        class="text-muted-foreground hover:text-foreground text-sm font-medium underline-offset-4 hover:underline"
                        onclick={clearAllBrands}
                      >
                        Select none
                      </button>
                    </div>

                    <div class="max-h-72 overflow-y-auto px-2 py-2">
                      {#each brands as brand (brand.id)}
                        <button
                          type="button"
                          class="hover:bg-accent/50 flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors"
                          onclick={() => toggleBrand(brand.alias)}
                        >
                          <Checkbox
                            checked={isBrandSelected(brand.alias)}
                            class="pointer-events-none mt-0.5"
                          />
                          <div class="min-w-0 space-y-1">
                            <p class="text-sm leading-none font-medium">
                              {brand.name}
                            </p>
                            <p
                              class="text-muted-foreground truncate text-xs uppercase"
                            >
                              {brand.alias}
                            </p>
                          </div>
                        </button>
                      {/each}
                    </div>

                    <div
                      class="flex items-center justify-between gap-2 border-t px-4 py-3"
                    >
                      <p class="text-muted-foreground text-xs">
                        {selectedAliases.length} / {brands.length} selected
                      </p>
                      <div class="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onclick={() => {
                            selectedAliases = [...appliedAliases];
                            brandFilterOpen = false;
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onclick={applyBrandFilters}
                        >
                          Done
                        </Button>
                      </div>
                    </div>
                  </div>
                </Popover.Content>
              </Popover.Root>

              <Button variant="outline" size="sm" onclick={resetBrandFilters}
                >Reset</Button
              >
            </div>
          </div>

          <div class="flex flex-wrap gap-2">
            {#each brands.filter( (brand) => appliedBrandAliases.has(brand.alias), ) as brand (brand.id)}
              <Badge variant="outline" class="gap-1.5 px-2.5 py-1">
                <span>{brand.name}</span>
                <button
                  type="button"
                  class="hover:bg-accent hover:text-accent-foreground inline-flex size-4 items-center justify-center rounded-full transition-colors"
                  aria-label={`Remove ${brand.name} from the filter`}
                  onclick={() => dismissBrand(brand.alias)}
                >
                  <XIcon class="size-3" />
                </button>
              </Badge>
            {/each}

            {#if appliedAliases.length === 0}
              <span class="text-muted-foreground text-sm">
                No brands selected. Apply to view an empty queue.
              </span>
            {/if}
          </div>
        </div>

        <Table.Root>
          <Table.Header>
            <Table.Row>
              {#each sortableColumns as sortableColumn (sortableColumn.column)}
                <Table.Head class={sortableColumn.className}>
                  <button
                    type="button"
                    class="hover:text-foreground inline-flex items-center gap-1.5 transition-colors"
                    onclick={() => handleSort(sortableColumn.column)}
                  >
                    <span>{sortableColumn.label}</span>
                    {#if isActiveSort(sortableColumn.column)}
                      {#if sortDir === "asc"}
                        <ArrowUpIcon class="size-3.5" />
                      {:else}
                        <ArrowDownIcon class="size-3.5" />
                      {/if}
                    {:else}
                      <ChevronsUpDownIcon class="size-3.5 opacity-50" />
                    {/if}
                  </button>
                </Table.Head>
              {/each}
              <Table.Head class="text-right">Action</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#if gaps.length === 0}
              <Table.Row>
                <Table.Cell
                  colspan={7}
                  class="text-muted-foreground py-10 text-center"
                >
                  No open pricing gaps found.
                </Table.Cell>
              </Table.Row>
            {:else}
              {#each gaps as gap, index (getGapRowKey(gap, index))}
                <Table.Row>
                  <Table.Cell>
                    <div class="space-y-1">
                      <p class="font-medium">{gap.item_name}</p>
                      <p class="text-muted-foreground font-mono text-xs">
                        {gap.trde_item}
                      </p>
                    </div>
                  </Table.Cell>
                  <Table.Cell>{gap.brand}</Table.Cell>
                  <Table.Cell>{gap.item_category}</Table.Cell>
                  <Table.Cell>
                    <div class="flex flex-wrap gap-2">
                      {#each gap.missing_fields as field (`${gap.trde_item}-${field}`)}
                        <Badge variant="outline">{field}</Badge>
                      {/each}
                    </div>
                  </Table.Cell>
                  <Table.Cell>
                    <Badge
                      variant={gap.status === "submitted"
                        ? "secondary"
                        : "outline"}
                    >
                      {gap.status}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell>
                    {new Date(gap.detected_at).toLocaleDateString()}
                  </Table.Cell>
                  <Table.Cell class="text-right">
                    <Button
                      href={gap.dq_id > 0
                        ? `/offers-data-quality/${gap.dq_id}`
                        : `/offers-data-quality/open/${gap.trde_item}`}
                      size="sm"
                    >
                      {gap.status === "submitted" ? "Review" : "Open form"}
                    </Button>
                  </Table.Cell>
                </Table.Row>
              {/each}
            {/if}
          </Table.Body>
        </Table.Root>

        {#if totalItems > 0}
          <div
            class="mt-6 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div class="text-muted-foreground text-sm">
              Showing {(page - 1) * pageSize + 1}-{Math.min(
                page * pageSize,
                totalItems,
              )} of {totalItems} gaps
            </div>
            <div class="flex items-center gap-2">
              <Button
                variant="outline"
                onclick={() => goToPage(page - 1)}
                disabled={page <= 1}
              >
                Previous
              </Button>
              <div
                class="text-muted-foreground inline-flex items-center gap-2 px-2 text-sm"
              >
                <ChevronsLeftRightEllipsisIcon class="size-4" />
                Page {page} / {totalPages}
              </div>
              <Button
                variant="outline"
                onclick={() => goToPage(page + 1)}
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
