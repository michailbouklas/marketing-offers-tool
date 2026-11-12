<script lang="ts">
  import ArchiveIcon from "@lucide/svelte/icons/archive";
  import ArrowDownIcon from "@lucide/svelte/icons/arrow-down";
  import ArrowUpIcon from "@lucide/svelte/icons/arrow-up";
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import ChevronsLeftRightEllipsisIcon from "@lucide/svelte/icons/chevrons-left-right-ellipsis";
  import ChevronsUpDownIcon from "@lucide/svelte/icons/chevrons-up-down";
  import DownloadIcon from "@lucide/svelte/icons/download";
  import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";
  import { toast } from "svelte-sonner";
  import DateRangeFilter from "$lib/components/date-range-filter.svelte";
  import MultiSelectFilter from "$lib/components/sales/multi-select-filter.svelte";
  import * as AlertDialog from "$lib/components/ui/alert-dialog/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button, buttonVariants } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import ChatWidget from "$lib/components/ai-chat/chat-widget.svelte";
  import { fetchGapQueue } from "$lib/services/offers-data-quality-list";
  import {
    appendGapQueueFilters,
    type GapListItem,
    type GapListPage,
    type GapQueueFilters,
  } from "$lib/services/offers-data-quality";
  import type {
    GapListSortDirection,
    GapListSortField,
  } from "$lib/services/offers-data-quality";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
  let appliedAliases = $state<string[]>([]);
  let filters = $state<GapQueueFilters>({
    channels: [],
    stores: [],
    cities: [],
  });
  // Recomputed by the server for the selected brands on every refresh.
  let filterOptions = $state<PageData["filterOptions"]>({
    channels: [],
    stores: [],
    cities: [],
  });
  let queuePage = $state<GapListPage>({
    items: [],
    totalItems: 0,
    submittedCount: 0,
    page: 1,
    pageSize: 50,
    totalPages: 1,
  });
  let onlySubmitted = $state(false);
  let currentSortBy = $state<GapListSortField>("brand");
  let currentSortDir = $state<GapListSortDirection>("asc");
  let isRefreshing = $state(false);
  let isExporting = $state(false);
  let selectedIds = $state<number[]>([]);
  let confirmRemoveOpen = $state(false);
  let isRemoving = $state(false);
  let latestRefreshRequestId = 0;
  let itemNameSearch = $state("");
  let itemCodeSearch = $state("");
  let searchTimer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => () => clearTimeout(searchTimer));

  function scheduleSearch() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => refreshQueue({ nextPage: 1 }), 500);
  }

  const gaps = $derived(queuePage.items);
  const brands = $derived(data.brands);
  const page = $derived(queuePage.page);
  const pageSize = $derived(queuePage.pageSize);
  const totalItems = $derived(queuePage.totalItems);
  const totalPages = $derived(queuePage.totalPages);
  const sortBy = $derived(currentSortBy);
  const sortDir = $derived(currentSortDir);
  const submittedCount = $derived(queuePage.submittedCount);
  const isAllBrands = $derived(appliedAliases.length === brands.length);
  const brandOptions = $derived(
    brands.map((brand) => ({ value: brand.alias, label: brand.name })),
  );
  const channelOptions = $derived(
    filterOptions.channels.map((channel) => ({
      value: channel,
      label: channel,
    })),
  );
  const cityOptions = $derived(
    filterOptions.cities.map((city) => ({ value: city, label: city })),
  );
  // Picking cities narrows the location list to those cities.
  const storeOptions = $derived(
    filterOptions.stores
      .filter(
        (option) =>
          filters.cities.length === 0 || filters.cities.includes(option.city),
      )
      .map((option) => ({ value: option.store, label: option.store })),
  );
  // Rows without a gap record yet (dq_id <= 0) have nothing to act on.
  const selectableIds = $derived(
    gaps.filter((gap) => gap.dq_id > 0).map((gap) => gap.dq_id),
  );
  const selectedIdSet = $derived(new Set(selectedIds));
  const allSelected = $derived(
    selectableIds.length > 0 &&
      selectableIds.every((id) => selectedIdSet.has(id)),
  );

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
    appliedAliases = [...data.selectedBrandAliases];
    filters = { ...data.filters };
    filterOptions = data.filterOptions;
    queuePage = data.gapsPage;
    selectedIds = [];
    currentSortBy = data.sortBy;
    currentSortDir = data.sortDir;
    onlySubmitted = data.statusFilter === "submitted";
  });

  // Empty brand pick means "all assigned brands", like the sales report.
  function applyBrands(values: string[]) {
    // Locations and cities belong to brands, so a brand change clears them.
    filters = { ...filters, stores: [], cities: [] };
    refreshQueue({
      aliases: values.length === 0 ? brands.map((b) => b.alias) : values,
      nextPage: 1,
    });
  }

  function applyFilters(next: Partial<GapQueueFilters>) {
    filters = { ...filters, ...next };
    refreshQueue({ nextPage: 1 });
  }

  async function refreshQueue({
    aliases = appliedAliases,
    nextSortBy = currentSortBy,
    nextSortDir = currentSortDir,
    nextPage = page,
    nextOnlySubmitted = onlySubmitted,
  }: {
    aliases?: string[];
    nextSortBy?: GapListSortField;
    nextSortDir?: GapListSortDirection;
    nextPage?: number;
    nextOnlySubmitted?: boolean;
  } = {}) {
    const requestId = ++latestRefreshRequestId;

    isRefreshing = true;

    try {
      const result = await fetchGapQueue(fetch, {
        brandAliases: aliases,
        page: nextPage,
        sortBy: nextSortBy,
        sortDir: nextSortDir,
        status: nextOnlySubmitted ? "submitted" : undefined,
        itemName: itemNameSearch,
        itemCode: itemCodeSearch,
        filters,
      });

      if (requestId !== latestRefreshRequestId) {
        return;
      }

      queuePage = result.gapsPage;
      // Never act on rows the user can no longer see.
      selectedIds = [];
      appliedAliases = [...result.selectedBrandAliases];
      filterOptions = result.filterOptions;
      currentSortBy = result.sortBy;
      currentSortDir = result.sortDir;
      onlySubmitted = nextOnlySubmitted;
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

  async function toggleOnlySubmitted() {
    await refreshQueue({
      aliases: appliedAliases,
      nextPage: 1,
      nextOnlySubmitted: !onlySubmitted,
    });
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

  async function exportExcel() {
    isExporting = true;
    try {
      const params = new URLSearchParams({ sortBy, sortDir });
      for (const alias of appliedAliases) {
        params.append("brandAlias", alias);
      }
      if (onlySubmitted) {
        params.set("status", "submitted");
      }
      if (itemNameSearch.trim()) {
        params.set("itemName", itemNameSearch.trim());
      }
      if (itemCodeSearch.trim()) {
        params.set("itemCode", itemCodeSearch.trim());
      }
      appendGapQueueFilters(params, filters);
      const response = await fetch(`/offers-data-quality/export?${params}`);
      if (!response.ok) {
        throw new Error(`Export failed (${response.status})`);
      }
      const { downloadUrl } = (await response.json()) as {
        downloadUrl: string;
      };
      window.location.assign(downloadUrl);
    } catch {
      toast.error("The Excel export could not be generated. Try again.");
    } finally {
      isExporting = false;
    }
  }

  function toggleAllRows() {
    selectedIds = allSelected ? [] : [...selectableIds];
  }

  function toggleRow(dqId: number, checked: boolean) {
    selectedIds = checked
      ? [...selectedIds, dqId]
      : selectedIds.filter((id) => id !== dqId);
  }

  async function removeSelected() {
    isRemoving = true;
    try {
      const response = await fetch("/api/gaps/dismiss", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: selectedIds }),
      });
      if (!response.ok) {
        throw new Error(`Remove failed (${response.status})`);
      }
      const result = (await response.json()) as {
        processedIds: number[];
        failed: Array<{ id: number; error: string }>;
      };
      if (result.processedIds.length > 0) {
        toast.success(
          `Removed ${result.processedIds.length} gap${result.processedIds.length === 1 ? "" : "s"} from the list.`,
        );
      }
      if (result.failed.length > 0) {
        toast.error(
          `${result.failed.length} not removed: ${result.failed[0].error}.`,
        );
      }
      confirmRemoveOpen = false;
      await refreshQueue();
    } catch {
      toast.error("The selected gaps could not be removed. Try again.");
    } finally {
      isRemoving = false;
    }
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
        <p class="text-muted-foreground text-xs">
          {#if data.snapshotRefreshedAt}
            Gap detection last refreshed {new Date(
              data.snapshotRefreshedAt,
            ).toLocaleString()}. New gaps and externally fixed pricing show up
            after the nightly refresh; submissions, approvals and rejections
            update immediately.
          {:else}
            Gap detection has not run yet. The queue index is being built;
            refresh the page in a moment.
          {/if}
        </p>
      </Card.Header>
      <Card.Content>
        <div
          class="mb-6 flex flex-col gap-3 rounded-2xl border border-dashed px-4 py-4 sm:px-5"
        >
          <div class="flex flex-wrap items-end gap-3">
            <MultiSelectFilter
              label="Brand"
              noun="brands"
              options={brandOptions}
              selected={isAllBrands ? [] : appliedAliases}
              onApply={applyBrands}
            />
            <MultiSelectFilter
              label="Channel"
              noun="channels"
              options={channelOptions}
              selected={filters.channels}
              onApply={(channels) => applyFilters({ channels })}
            />
            <MultiSelectFilter
              label="City"
              noun="cities"
              options={cityOptions}
              selected={filters.cities}
              onApply={(cities) => applyFilters({ cities, stores: [] })}
            />
            <MultiSelectFilter
              label="Location"
              noun="locations"
              options={storeOptions}
              selected={filters.stores}
              onApply={(stores) => applyFilters({ stores })}
            />
            <div class="space-y-2">
              <span class="text-sm font-medium">Detected</span>
              <DateRangeFilter
                from={filters.detectedFrom}
                to={filters.detectedTo}
                onApply={(range) =>
                  applyFilters({
                    detectedFrom: range.from,
                    detectedTo: range.to,
                  })}
              />
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={onlySubmitted ? "default" : "outline"}
              size="sm"
              aria-pressed={onlySubmitted}
              onclick={toggleOnlySubmitted}
            >
              Awaiting approval
              <Badge
                variant={onlySubmitted ? "secondary" : "outline"}
                class="ml-1.5 px-1.5"
              >
                {submittedCount}
              </Badge>
            </Button>

            <Button
              variant="outline"
              size="sm"
              disabled={isExporting || totalItems === 0}
              onclick={exportExcel}
            >
              {#if isExporting}
                <LoaderCircleIcon class="size-4 animate-spin" />
              {:else}
                <DownloadIcon class="size-4" />
              {/if}
              Export to Excel
            </Button>

            <DropdownMenu.Root>
              <DropdownMenu.Trigger
                class={buttonVariants({ variant: "outline", size: "sm" })}
                disabled={!data.canDismiss || selectedIds.length === 0}
                title={data.canDismiss
                  ? undefined
                  : "Only approvers can run bulk actions"}
              >
                Actions
                {#if selectedIds.length > 0}
                  <Badge variant="secondary" class="px-1.5">
                    {selectedIds.length}
                  </Badge>
                {/if}
                <ChevronDownIcon class="size-4 opacity-60" />
              </DropdownMenu.Trigger>
              <DropdownMenu.Content align="end" class="w-52">
                <DropdownMenu.Item
                  variant="destructive"
                  onSelect={() => (confirmRemoveOpen = true)}
                >
                  <Trash2Icon />
                  Remove from list
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Root>

            {#if data.canDismiss}
              <Button
                href="/offers-data-quality/flagged"
                variant="outline"
                size="sm"
              >
                <ArchiveIcon class="size-4" />
                Flagged offers
              </Button>
            {/if}
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            <div class="space-y-1.5">
              <Label for="gap-search-name">Offer name</Label>
              <Input
                id="gap-search-name"
                type="search"
                placeholder="Search by offer name"
                maxlength={100}
                bind:value={itemNameSearch}
                oninput={scheduleSearch}
              />
            </div>
            <div class="space-y-1.5">
              <Label for="gap-search-code">Item code</Label>
              <Input
                id="gap-search-code"
                type="search"
                placeholder="Search by item code"
                maxlength={100}
                bind:value={itemCodeSearch}
                oninput={scheduleSearch}
              />
            </div>
          </div>
        </div>

        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.Head class="w-10">
                <Checkbox
                  checked={allSelected}
                  indeterminate={selectedIds.length > 0 && !allSelected}
                  disabled={selectableIds.length === 0}
                  onCheckedChange={toggleAllRows}
                  aria-label="Select all gaps on this page"
                />
              </Table.Head>
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
                  colspan={8}
                  class="text-muted-foreground py-10 text-center"
                >
                  No open pricing gaps found.
                </Table.Cell>
              </Table.Row>
            {:else}
              {#each gaps as gap, index (getGapRowKey(gap, index))}
                <Table.Row
                  data-state={selectedIdSet.has(gap.dq_id)
                    ? "selected"
                    : undefined}
                >
                  <Table.Cell>
                    {#if gap.dq_id > 0}
                      <Checkbox
                        checked={selectedIdSet.has(gap.dq_id)}
                        onCheckedChange={(checked) =>
                          toggleRow(gap.dq_id, checked === true)}
                        aria-label={`Select ${gap.item_name}`}
                      />
                    {/if}
                  </Table.Cell>
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
                      target="_blank"
                      rel="noopener noreferrer"
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

    <AlertDialog.Root bind:open={confirmRemoveOpen}>
      <AlertDialog.Content>
        <AlertDialog.Header>
          <AlertDialog.Title>
            Remove {selectedIds.length} gap{selectedIds.length === 1 ? "" : "s"} from
            the list?
          </AlertDialog.Title>
          <AlertDialog.Description>
            Use this for invalid or outdated offers. Removed items will not come
            back after the nightly refresh. Gaps awaiting approval are skipped;
            reject those instead.
          </AlertDialog.Description>
        </AlertDialog.Header>
        <AlertDialog.Footer>
          <AlertDialog.Cancel disabled={isRemoving}>Cancel</AlertDialog.Cancel>
          <Button
            variant="destructive"
            disabled={isRemoving}
            onclick={removeSelected}
          >
            {#if isRemoving}
              <LoaderCircleIcon class="size-4 animate-spin" />
            {/if}
            Remove from list
          </Button>
        </AlertDialog.Footer>
      </AlertDialog.Content>
    </AlertDialog.Root>

    <ChatWidget
      agentId="offers-data-quality-agent"
      title="Data Quality Assistant"
      greeting="Hi! Ask me about pricing gaps, submission status, and current offer pricing for your brands…"
    />
  </main>
</div>
