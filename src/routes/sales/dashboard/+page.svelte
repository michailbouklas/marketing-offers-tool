<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import DateRangeFilter from "$lib/components/date-range-filter.svelte";
  import SalesTrendChart from "$lib/components/sales/sales-trend-chart.svelte";
  import { Button, buttonVariants } from "$lib/components/ui/button/index.js";
  import * as ButtonGroup from "$lib/components/ui/button-group/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import * as NativeSelect from "$lib/components/ui/native-select/index.js";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import {
    buildSalesDayRows,
    formatSalesAmount,
    formatSalesCount,
    salesDashboardSearch,
    type SalesDashboardFilters,
    type SalesDashboardView,
  } from "$lib/services/sales-dashboard";
  import ChartLineIcon from "@lucide/svelte/icons/chart-line";
  import ChevronsUpDownIcon from "@lucide/svelte/icons/chevrons-up-down";
  import DownloadIcon from "@lucide/svelte/icons/download";
  import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
  import TableIcon from "@lucide/svelte/icons/table";
  import { toast } from "svelte-sonner";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  let brandFilterOpen = $state(false);
  let selectedAliases = $state<string[]>([]);
  let exporting = $state(false);

  const filters = $derived(data.scope?.filters ?? null);
  const allBrands = $derived(data.scope?.brands ?? []);
  const shownBrands = $derived(
    filters
      ? allBrands.filter((brand) => filters.brands.includes(brand.alias))
      : [],
  );
  const days = $derived(
    filters && data.rows
      ? buildSalesDayRows(data.rows, filters.brands, filters.from, filters.to)
      : [],
  );
  const visibleDivisions = $derived(
    (data.divisions ?? []).filter(
      (option) =>
        !filters?.divisionGroup || option.group === filters.divisionGroup,
    ),
  );
  const divisionGroups = $derived([
    ...new Set((data.divisions ?? []).map((option) => option.group)),
  ]);
  const totals = $derived(
    shownBrands.map((brand) => ({
      ...brand,
      net: days.reduce((sum, day) => sum + day.byBrand[brand.alias].net, 0),
      txns: days.reduce((sum, day) => sum + day.byBrand[brand.alias].txns, 0),
    })),
  );

  function href(
    next: Partial<SalesDashboardFilters>,
    view: SalesDashboardView = data.view,
  ): string {
    if (!filters) {
      return page.url.pathname;
    }
    const merged = { ...filters, ...next };
    const search = salesDashboardSearch(merged, {
      allBrands: merged.brands.length === allBrands.length,
      view,
    });
    return `${page.url.pathname}?${search}`;
  }

  function navigate(next: Partial<SalesDashboardFilters>) {
    goto(href(next), { keepFocus: true, noScroll: true });
  }

  function openBrandFilter(open: boolean) {
    if (open && filters) {
      selectedAliases = [...filters.brands];
    }
    brandFilterOpen = open;
  }

  function toggleBrand(alias: string) {
    selectedAliases = selectedAliases.includes(alias)
      ? selectedAliases.filter((value) => value !== alias)
      : [...selectedAliases, alias];
  }

  function applyBrands() {
    brandFilterOpen = false;
    if (selectedAliases.length === 0) {
      return;
    }
    // A store picked under the previous brands may not belong to the new set.
    navigate({ brands: selectedAliases, locationId: null });
  }

  function selectValue(event: Event): string | null {
    const value = (event.currentTarget as HTMLSelectElement).value;
    return value === "" ? null : value;
  }

  function onGroupChange(event: Event) {
    const divisionGroup = selectValue(event);
    const keepDivision = (data.divisions ?? []).some(
      (option) =>
        option.division === filters?.divisionName &&
        (divisionGroup === null || option.group === divisionGroup),
    );
    navigate({
      divisionGroup,
      divisionName: keepDivision ? (filters?.divisionName ?? null) : null,
    });
  }

  function brandSummary(): string {
    if (!filters || filters.brands.length === allBrands.length) {
      return "All your brands";
    }
    if (shownBrands.length === 1) {
      return shownBrands[0].name;
    }
    return `${shownBrands.length} brands`;
  }

  async function exportExcel() {
    exporting = true;
    try {
      const response = await fetch(
        `${page.url.pathname}/export${page.url.search}`,
      );
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
      exporting = false;
    }
  }
</script>

<svelte:head>
  <title>Sales Dashboard | Aggregator Offers Tool</title>
</svelte:head>

<main
  class="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10"
>
  <section class="space-y-2">
    <h1 class="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
      Sales Dashboard
    </h1>
    <p class="text-muted-foreground max-w-3xl text-base leading-7">
      Daily net sales (excl. VAT) and transactions from the POS for your brands.
      Refunds are excluded.
    </p>
  </section>

  {#if !filters}
    <Card.Root>
      <Card.Content class="text-muted-foreground py-8 text-sm">
        You are not assigned to any brand yet, so there are no sales to show.
        Ask an admin to assign your brands.
      </Card.Content>
    </Card.Root>
  {:else}
    <div class="flex flex-wrap items-end gap-3">
      <div class="space-y-2">
        <span class="text-sm font-medium">Brands</span>
        <Popover.Root open={brandFilterOpen} onOpenChange={openBrandFilter}>
          <Popover.Trigger
            class={`${buttonVariants({ variant: "outline" })} flex min-w-48 justify-between`}
          >
            <span class="truncate">{brandSummary()}</span>
            <ChevronsUpDownIcon class="size-4 opacity-60" />
          </Popover.Trigger>
          <Popover.Content align="start" class="w-72 p-0">
            <div
              class="flex items-center justify-between gap-2 border-b px-4 py-2"
            >
              <button
                type="button"
                class="text-sm font-medium underline-offset-4 hover:underline"
                onclick={() =>
                  (selectedAliases = allBrands.map((brand) => brand.alias))}
              >
                Select all
              </button>
              <button
                type="button"
                class="text-muted-foreground hover:text-foreground text-sm font-medium underline-offset-4 hover:underline"
                onclick={() => (selectedAliases = [])}
              >
                Select none
              </button>
            </div>
            <div class="max-h-72 overflow-y-auto p-2">
              {#each allBrands as brand (brand.alias)}
                <button
                  type="button"
                  class="hover:bg-accent/50 flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm"
                  onclick={() => toggleBrand(brand.alias)}
                >
                  <Checkbox
                    checked={selectedAliases.includes(brand.alias)}
                    class="pointer-events-none"
                  />
                  {brand.name}
                </button>
              {/each}
            </div>
            <div
              class="flex items-center justify-between gap-2 border-t px-4 py-3"
            >
              <p class="text-muted-foreground text-xs">
                {selectedAliases.length} / {allBrands.length} selected
              </p>
              <Button
                type="button"
                size="sm"
                disabled={selectedAliases.length === 0}
                onclick={applyBrands}
              >
                Apply
              </Button>
            </div>
          </Popover.Content>
        </Popover.Root>
      </div>

      <div class="space-y-2">
        <label class="text-sm font-medium" for="location">Location</label>
        <NativeSelect.Root
          id="location"
          value={filters.locationId?.toString() ?? ""}
          onchange={(event) => {
            const value = selectValue(event);
            navigate({ locationId: value === null ? null : Number(value) });
          }}
        >
          <NativeSelect.Option value="">All locations</NativeSelect.Option>
          {#each data.locations ?? [] as location (location.id)}
            <NativeSelect.Option value={location.id.toString()}>
              {location.name}
            </NativeSelect.Option>
          {/each}
        </NativeSelect.Root>
      </div>

      <div class="space-y-2">
        <label class="text-sm font-medium" for="group">Division group</label>
        <NativeSelect.Root
          id="group"
          value={filters.divisionGroup ?? ""}
          onchange={onGroupChange}
        >
          <NativeSelect.Option value="">All groups</NativeSelect.Option>
          {#each divisionGroups as group (group)}
            <NativeSelect.Option value={group}>{group}</NativeSelect.Option>
          {/each}
        </NativeSelect.Root>
      </div>

      <div class="space-y-2">
        <label class="text-sm font-medium" for="division">Division</label>
        <NativeSelect.Root
          id="division"
          value={filters.divisionName ?? ""}
          onchange={(event) => navigate({ divisionName: selectValue(event) })}
        >
          <NativeSelect.Option value="">All divisions</NativeSelect.Option>
          {#each visibleDivisions as option (`${option.group}|${option.division}`)}
            <NativeSelect.Option value={option.division}>
              {option.division}
            </NativeSelect.Option>
          {/each}
        </NativeSelect.Root>
      </div>

      <div class="space-y-2">
        <span class="text-sm font-medium">Date range</span>
        <DateRangeFilter
          from={filters.from}
          to={filters.to}
          onApply={(range) =>
            goto(
              `${page.url.pathname}?${salesDashboardSearch(
                // An empty range ("All time") falls back to the default window.
                { ...filters, from: range.from ?? "", to: range.to ?? "" },
                {
                  allBrands: filters.brands.length === allBrands.length,
                  view: data.view,
                },
              )}`,
              { keepFocus: true, noScroll: true },
            )}
        />
      </div>
    </div>

    <Card.Root>
      <Card.Header>
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="space-y-1">
            <Card.Title>Sales over time</Card.Title>
            <Card.Description>
              {filters.from} to {filters.to} · {formatSalesCount(
                totals.reduce((sum, brand) => sum + brand.txns, 0),
              )} transactions · {formatSalesAmount(
                totals.reduce((sum, brand) => sum + brand.net, 0),
              )}
            </Card.Description>
          </div>
          <div class="flex items-center gap-2">
            <ButtonGroup.Root>
              <Button
                href={href({}, "chart")}
                variant={data.view === "chart" ? "default" : "outline"}
                aria-current={data.view === "chart" ? "page" : undefined}
              >
                <ChartLineIcon class="size-4" />
                Chart
              </Button>
              <Button
                href={href({}, "table")}
                variant={data.view === "table" ? "default" : "outline"}
                aria-current={data.view === "table" ? "page" : undefined}
              >
                <TableIcon class="size-4" />
                Table
              </Button>
            </ButtonGroup.Root>
            <Button
              variant="outline"
              disabled={exporting}
              onclick={exportExcel}
            >
              {#if exporting}
                <LoaderCircleIcon class="size-4 animate-spin" />
              {:else}
                <DownloadIcon class="size-4" />
              {/if}
              Export
            </Button>
          </div>
        </div>
      </Card.Header>
      <Card.Content>
        {#if data.view === "chart"}
          <SalesTrendChart {days} brands={shownBrands} />
        {:else}
          <div class="max-h-[36rem] overflow-auto">
            <Table.Root>
              <Table.Header>
                <Table.Row>
                  <Table.Head rowspan={2}>Date</Table.Head>
                  {#each shownBrands as brand (brand.alias)}
                    <Table.Head colspan={2} class="text-center">
                      {brand.name}
                    </Table.Head>
                  {/each}
                </Table.Row>
                <Table.Row>
                  {#each shownBrands as brand (brand.alias)}
                    <Table.Head class="text-right">Transactions</Table.Head>
                    <Table.Head class="text-right">Net sales</Table.Head>
                  {/each}
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {#each days as day (day.day)}
                  <Table.Row>
                    <Table.Cell class="tabular-nums">{day.day}</Table.Cell>
                    {#each shownBrands as brand (brand.alias)}
                      <Table.Cell class="text-right tabular-nums">
                        {formatSalesCount(day.byBrand[brand.alias].txns)}
                      </Table.Cell>
                      <Table.Cell class="text-right tabular-nums">
                        {formatSalesAmount(day.byBrand[brand.alias].net)}
                      </Table.Cell>
                    {/each}
                  </Table.Row>
                {/each}
              </Table.Body>
              <Table.Footer>
                <Table.Row>
                  <Table.Cell class="font-medium">Total</Table.Cell>
                  {#each totals as brand (brand.alias)}
                    <Table.Cell class="text-right font-medium tabular-nums">
                      {formatSalesCount(brand.txns)}
                    </Table.Cell>
                    <Table.Cell class="text-right font-medium tabular-nums">
                      {formatSalesAmount(brand.net)}
                    </Table.Cell>
                  {/each}
                </Table.Row>
              </Table.Footer>
            </Table.Root>
          </div>
        {/if}
      </Card.Content>
    </Card.Root>
  {/if}
</main>
