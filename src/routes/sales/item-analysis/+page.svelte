<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import ChatWidget from "$lib/components/ai-chat/chat-widget.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import DateRangeFilter from "$lib/components/date-range-filter.svelte";
  import * as ButtonGroup from "$lib/components/ui/button-group/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import MultiSelectFilter from "$lib/components/sales/multi-select-filter.svelte";
  import {
    formatSalesAmount,
    formatSalesCount,
  } from "$lib/services/sales-dashboard";
  import type {
    ItemAnalysisFigures,
    ItemAnalysisReport,
  } from "$lib/services/sales-item-analysis";
  import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
  import DownloadIcon from "@lucide/svelte/icons/download";
  import { toast } from "svelte-sonner";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  let exporting = $state(false);

  /** Server rebuilds the .xlsx from the URL's filters (same as the offers export). */
  async function exportExcel() {
    exporting = true;
    try {
      const response = await fetch(
        `${page.url.pathname}/export${page.url.search}`,
      );
      if (!response.ok) throw new Error(`Export failed (${response.status})`);
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

  /**
   * Same page with some params changed: a string sets it, an array repeats it,
   * empty / null removes it. Everything else in the URL is kept.
   */
  function reportHref(changes: Record<string, string | string[] | null>) {
    const params = new URLSearchParams(page.url.searchParams);
    for (const [key, value] of Object.entries(changes)) {
      params.delete(key);
      for (const item of [value ?? []].flat()) {
        if (item) params.append(key, item);
      }
    }
    return `${page.url.pathname}?${params}`;
  }

  const apply = (changes: Parameters<typeof reportHref>[0]) =>
    goto(reportHref(changes), { keepFocus: true, noScroll: true });

  const monthFormat = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const allBrands = $derived(data.scope?.brands ?? []);
  const brand = $derived(
    allBrands.find((item) => item.alias === data.scope?.filters.brands[0]) ??
      null,
  );

  const pct = new Intl.NumberFormat("en-GB", {
    style: "percent",
    maximumFractionDigits: 0,
  });
  const pctFine = new Intl.NumberFormat("en-GB", {
    style: "percent",
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });

  const HEADERS = [
    "Quantity",
    "Grp %",
    "Tot %",
    "Qty/Tr",
    "Trans",
    "Grp %",
    "Tot %",
    "Net sales",
    "Grp %",
    "Tot %",
  ];
  /** Vertical rule before each block (Quantity, Trans, Net sales), like the POS report. */
  const blockStart = (index: number) =>
    index === 0 || index === 4 || index === 7 ? "border-l" : "";

  const cells = (row: ItemAnalysisFigures) => [
    formatSalesCount(row.qty),
    pct.format(row.qtyGrp),
    pct.format(row.qtyTot),
    pctFine.format(row.qtyPerTrans),
    formatSalesCount(row.trans),
    pct.format(row.transGrp),
    pct.format(row.transTot),
    formatSalesAmount(row.net),
    pct.format(row.netGrp),
    pct.format(row.netTot),
  ];
</script>

<svelte:head>
  <title>Item analysis</title>
</svelte:head>

<main
  class="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10"
>
  <section class="space-y-2">
    <h1 class="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
      Item analysis
    </h1>
    <p class="text-muted-foreground max-w-3xl text-base leading-7">
      Quantity, transactions and net sales (excl. VAT) of every item, grouped by
      POS category, like the POS Item Analysis Report. Combo and offer money is
      booked to the offer; items inside a combo are not counted again, and a
      half pizza counts 0.5. Grp % is the share of the category, Tot % the share
      of everything selected, and Qty/Tr the item's quantity per transaction of
      the selection.
    </p>
  </section>

  {#if !data.scope || !brand}
    <Card.Root>
      <Card.Content class="text-muted-foreground py-8 text-sm">
        You are not assigned to any brand yet, so there are no sales to show.
        Ask an admin to assign your brands.
      </Card.Content>
    </Card.Root>
  {:else}
    {@const range = data.range}
    {@const channels = data.scope.filters.channels}
    {@const locations = data.locations ?? []}
    {@const cities = data.cities ?? []}
    {@const cityOptions = [
      ...new Set((data.locationOptions ?? []).map((item) => item.city)),
    ]
      .filter((city) => city)
      .sort()
      .map((city) => ({ value: city, label: city }))}
    {@const locationOptions = (data.locationOptions ?? [])
      .filter((item) => cities.length === 0 || cities.includes(item.city))
      .map((item) => ({
        value: String(item.id),
        label: item.name,
      }))}
    <div
      class="bg-background sticky top-14 z-30 -mx-4 flex flex-wrap items-end gap-6 border-b px-4 py-3 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
    >
      <div class="space-y-2">
        <span class="text-sm font-medium" id="brand-label">Brand</span>
        <ButtonGroup.Root aria-labelledby="brand-label" class="flex-wrap">
          {#each allBrands as item (item.alias)}
            <!-- Each brand has its own channels, locations and categories: reset them. -->
            <Button
              href={reportHref({
                brands: item.alias,
                channels: null,
                locations: null,
                cities: null,
                category: null,
              })}
              variant={item.alias === brand.alias ? "default" : "outline"}
              aria-current={item.alias === brand.alias ? "page" : undefined}
            >
              {item.name}
            </Button>
          {/each}
        </ButtonGroup.Root>
      </div>

      <div class="space-y-2">
        <span class="text-sm font-medium">Date range</span>
        <DateRangeFilter
          from={range.from}
          to={range.to}
          onApply={(next) =>
            apply({ from: next.from ?? null, to: next.to ?? null })}
        />
      </div>

      <MultiSelectFilter
        label="Channel"
        options={(data.channels ?? []).map((value) => ({
          value,
          label: value,
        }))}
        noun="channels"
        selected={channels}
        onApply={(next) => apply({ channels: next.join(",") })}
      />

      <MultiSelectFilter
        label="City"
        options={cityOptions}
        noun="cities"
        selected={cities}
        onApply={(next) => apply({ cities: next.join(","), locations: null })}
      />

      <MultiSelectFilter
        label="Location"
        options={locationOptions}
        noun="locations"
        selected={locations.map(String)}
        onApply={(next) => apply({ locations: next.join(",") })}
      />

      <MultiSelectFilter
        label="Category"
        options={(data.categoryOptions ?? []).map((value) => ({
          value,
          label: value,
        }))}
        noun="categories"
        searchable
        selected={data.categories ?? []}
        onApply={(next) => apply({ category: next })}
      />

      <div class="flex h-9 items-center gap-2">
        <Switch
          id="group-by-month"
          checked={data.byMonth ?? false}
          onCheckedChange={(checked) =>
            apply({ byMonth: checked ? "1" : null })}
        />
        <Label for="group-by-month">Group by month</Label>
      </div>

      <Button
        variant="outline"
        disabled={exporting}
        onclick={exportExcel}
        class="ml-auto"
      >
        {#if exporting}
          <LoaderCircleIcon class="animate-spin" aria-hidden="true" />
        {:else}
          <DownloadIcon aria-hidden="true" />
        {/if}
        Export to Excel
      </Button>
    </div>

    {#await data.report}
      <Card.Root aria-busy="true">
        <Card.Content class="space-y-3 py-6">
          <p class="text-muted-foreground text-sm">
            Adding up {brand.name}'s item sales from {range.from} to {range.to}.
          </p>
          {#each { length: 8 } as _, index (index)}
            <Skeleton class="h-8 w-full" />
          {/each}
        </Card.Content>
      </Card.Root>
    {:then entries}
      {#if entries.every((entry) => entry.report.groups.length === 0)}
        <Card.Root>
          <Card.Content class="text-muted-foreground py-8 text-sm">
            No sales found for {brand.name} from {range.from} to {range.to} with these
            filters.
          </Card.Content>
        </Card.Root>
      {:else}
        {#each entries as entry (entry.month)}
          {#if entry.month}
            <h2 class="text-xl font-semibold tracking-tight">
              {monthFormat.format(new Date(entry.month))}
            </h2>
          {/if}
          {@render reportTable(entry.report)}
        {/each}
      {/if}
    {:catch}
      <Card.Root>
        <Card.Content class="text-destructive py-8 text-sm">
          Could not load the item analysis for {brand.name}. Try again in a
          moment.
        </Card.Content>
      </Card.Root>
    {/await}

    {#snippet reportTable(report: ItemAnalysisReport)}
      <Card.Root class="py-0">
        <Card.Content class="px-0">
          <Table.Root class="text-xs">
            <Table.Header class="bg-background sticky top-0">
              <Table.Row>
                <Table.Head>Item</Table.Head>
                <Table.Head></Table.Head>
                {#each HEADERS as header, index (index)}
                  <Table.Head class={["text-right", blockStart(index)]}>
                    {header}
                  </Table.Head>
                {/each}
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {#each report.groups as group (group.category)}
                <Table.Row class="bg-muted/50 hover:bg-muted/50">
                  <Table.Cell colspan={12} class="font-semibold">
                    {group.category}
                  </Table.Cell>
                </Table.Row>
                {#each group.items as item (item.code)}
                  <Table.Row>
                    <Table.Cell class="font-mono">{item.code}</Table.Cell>
                    <Table.Cell>{item.name}</Table.Cell>
                    {#each cells(item) as cell, index (index)}
                      <Table.Cell
                        class={["text-right tabular-nums", blockStart(index)]}
                      >
                        {cell}
                      </Table.Cell>
                    {/each}
                  </Table.Row>
                {/each}
                <Table.Row class="font-semibold">
                  <Table.Cell colspan={2}>{group.category} total</Table.Cell>
                  {#each cells(group.total) as cell, index (index)}
                    <Table.Cell
                      class={["text-right tabular-nums", blockStart(index)]}
                    >
                      {index === 1 || index === 5 || index === 8 ? "" : cell}
                    </Table.Cell>
                  {/each}
                </Table.Row>
              {/each}
            </Table.Body>
            <Table.Footer>
              <Table.Row class="font-semibold">
                <Table.Cell colspan={2}>Grand totals</Table.Cell>
                <Table.Cell class="border-l text-right tabular-nums">
                  {formatSalesCount(report.grand.qty)}
                </Table.Cell>
                <Table.Cell colspan={3}></Table.Cell>
                <Table.Cell class="border-l text-right tabular-nums">
                  {formatSalesCount(report.grand.trans)}
                </Table.Cell>
                <Table.Cell colspan={2}></Table.Cell>
                <Table.Cell class="border-l text-right tabular-nums">
                  {formatSalesAmount(report.grand.net)}
                </Table.Cell>
                <Table.Cell colspan={2}></Table.Cell>
              </Table.Row>
            </Table.Footer>
          </Table.Root>
        </Card.Content>
      </Card.Root>
    {/snippet}

    <!-- Page filters are defaults only; brand scope is enforced server-side. -->
    <ChatWidget
      agentId="item-analysis-agent"
      title="Item Analysis Assistant"
      greeting="Hi! Ask me which items or categories sell most, an item's share of its category, or how two periods compare."
      placeholder="e.g. Top 10 items by net sales on Wolt"
      context={{
        brands: [brand.alias],
        from: range.from,
        to: range.to,
        channels,
        locations: data.scopedLocations ?? [],
        cities,
      }}
    />
  {/if}
</main>
