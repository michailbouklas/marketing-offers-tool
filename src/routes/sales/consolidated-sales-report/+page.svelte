<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import ChatWidget from "$lib/components/ai-chat/chat-widget.svelte";
  import DateRangeFilter from "$lib/components/date-range-filter.svelte";
  import MultiSelectFilter from "$lib/components/sales/multi-select-filter.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import {
    consolidatedSearch,
    WEEKDAY_OPTIONS,
    type ConsolidatedExtras,
    type ConsolidatedTotals,
  } from "$lib/services/sales-consolidated";
  import {
    formatSalesAmount,
    formatSalesCount,
    type SalesDashboardFilters,
  } from "$lib/services/sales-dashboard";
  import DownloadIcon from "@lucide/svelte/icons/download";
  import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
  import { toast } from "svelte-sonner";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  let exporting = $state(false);

  const filters = $derived(data.scope?.filters ?? null);
  const extras = $derived<ConsolidatedExtras>(
    data.extras ?? { stores: [], cities: [], weekdays: [] },
  );
  const allBrands = $derived(data.scope?.brands ?? []);
  const isAllBrands = $derived(
    !!filters && filters.brands.length === allBrands.length,
  );
  const report = $derived(data.report ?? null);

  const brandOptions = $derived(
    allBrands.map((brand) => ({ value: brand.alias, label: brand.name })),
  );
  const channelOptions = $derived(
    (data.channels ?? []).map((channel) => ({
      value: channel,
      label: channel,
    })),
  );
  // Picking cities narrows the location list to those cities.
  const storeOptions = $derived(
    (data.stores ?? [])
      .filter(
        (option) =>
          extras.cities.length === 0 || extras.cities.includes(option.city),
      )
      .map((option) => ({ value: option.store, label: option.location })),
  );
  const cityOptions = $derived(
    (data.cities ?? []).map((city) => ({ value: city, label: city })),
  );
  const weekdayOptions = WEEKDAY_OPTIONS.map((day) => ({
    value: String(day.value),
    label: day.label,
  }));

  const money = (value: number) => formatSalesAmount(value);
  const maybeMoney = (value: number | null) =>
    value === null ? "–" : formatSalesAmount(value);

  function navigate(
    next: Partial<SalesDashboardFilters>,
    nextExtras: Partial<ConsolidatedExtras> = {},
    allBrandsNext = isAllBrands,
  ) {
    if (!filters) return;
    const search = consolidatedSearch(
      { ...filters, ...next },
      { ...extras, ...nextExtras },
      allBrandsNext,
    );
    goto(`${page.url.pathname}?${search}`, {
      keepFocus: true,
      noScroll: true,
    });
  }

  // Locations belong to brands, so changing brands clears the location pick.
  function applyBrands(values: string[]) {
    navigate(
      { brands: values.length === 0 ? allBrands.map((b) => b.alias) : values },
      { stores: [] },
      values.length === 0,
    );
  }

  function summaryLine(values: string[], all: string): string {
    return values.length === 0 ? all : values.join(", ");
  }

  const headerLines = $derived.by(() => {
    if (!filters) return [];
    const brandNames = isAllBrands
      ? []
      : allBrands
          .filter((brand) => filters.brands.includes(brand.alias))
          .map((brand) => brand.name);
    const storeNames = (data.stores ?? [])
      .filter((option) => extras.stores.includes(option.store))
      .map((option) => option.location);
    const days = WEEKDAY_OPTIONS.filter((day) =>
      extras.weekdays.includes(day.value),
    ).map((day) => `${day.label}s`);
    return [
      `${summaryLine(storeNames, "All locations")} / ${summaryLine(extras.cities, "All cities")}`,
      `${summaryLine(brandNames, "All brands")} / ${summaryLine(filters.channels, "All channels")}`,
      `From ${filters.from} to ${filters.to} / ${summaryLine(days, "All days")}`,
    ];
  });

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

{#snippet totalsCells(total: ConsolidatedTotals)}
  <Table.Cell class="text-right">{formatSalesCount(total.trans)}</Table.Cell>
  <Table.Cell class="text-right">{money(total.gross)}</Table.Cell>
  <Table.Cell class="text-right">{money(total.discount)}</Table.Cell>
  <Table.Cell class="text-right">{money(total.net)}</Table.Cell>
  <Table.Cell class="text-right">{maybeMoney(total.avgGross)}</Table.Cell>
  <Table.Cell class="text-right">{maybeMoney(total.avgNet)}</Table.Cell>
{/snippet}

<svelte:head>
  <title>Consolidated Sales Report | Aggregator Offers Tool</title>
</svelte:head>

<main
  class="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10"
>
  <section class="space-y-2">
    <h1 class="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
      Consolidated Sales Report
    </h1>
    <p class="text-muted-foreground max-w-3xl text-base leading-7">
      Transactions, gross, discount and net sales (excl. VAT, returns netted
      out) per location, grouped by company.
    </p>
  </section>

  {#if !filters || !report}
    <Card.Root>
      <Card.Content class="text-muted-foreground py-8 text-sm">
        You are not assigned to any brand yet, so there are no sales to show.
        Ask an admin to assign your brands.
      </Card.Content>
    </Card.Root>
  {:else}
    <div class="flex flex-wrap items-end gap-3">
      <MultiSelectFilter
        label="Brand"
        noun="brands"
        options={brandOptions}
        selected={isAllBrands ? [] : filters.brands}
        onApply={applyBrands}
      />
      <MultiSelectFilter
        label="Channel"
        noun="channels"
        options={channelOptions}
        selected={filters.channels}
        onApply={(channels) => navigate({ channels })}
      />
      <MultiSelectFilter
        label="City"
        noun="cities"
        options={cityOptions}
        selected={extras.cities}
        onApply={(cities) => navigate({}, { cities, stores: [] })}
      />
      <MultiSelectFilter
        label="Location"
        noun="locations"
        options={storeOptions}
        selected={extras.stores}
        onApply={(stores) => navigate({}, { stores })}
      />
      <MultiSelectFilter
        label="Weekday"
        noun="days"
        options={weekdayOptions}
        selected={extras.weekdays.map(String)}
        onApply={(days) => navigate({}, { weekdays: days.map(Number) })}
      />

      <div class="space-y-2">
        <span class="text-sm font-medium">Date range</span>
        <DateRangeFilter
          from={filters.from}
          to={filters.to}
          onApply={(range) =>
            // An empty range ("All time") falls back to the default window.
            navigate({ from: range.from ?? "", to: range.to ?? "" })}
        />
      </div>

      <Button
        variant="outline"
        disabled={exporting || report.groups.length === 0}
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

    <Card.Root>
      <Card.Header>
        <Card.Title>Total sales analysis</Card.Title>
        <Card.Description>
          {#each headerLines as line (line)}
            <span class="block">{line}</span>
          {/each}
        </Card.Description>
      </Card.Header>
      <Card.Content>
        {#if report.groups.length === 0}
          <p class="text-muted-foreground py-6 text-sm">
            No sales match the current filters.
          </p>
        {:else}
          <Table.Root>
            <Table.Header>
              <Table.Row>
                <Table.Head>Location</Table.Head>
                <Table.Head>City</Table.Head>
                <Table.Head class="text-right">Trans</Table.Head>
                <Table.Head class="text-right">Gross</Table.Head>
                <Table.Head class="text-right">Discount</Table.Head>
                <Table.Head class="text-right">Net</Table.Head>
                <Table.Head class="text-right">Avg gross</Table.Head>
                <Table.Head class="text-right">Avg net</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {#each report.groups as group (group.company)}
                <Table.Row class="bg-muted/40 hover:bg-muted/40">
                  <Table.Cell colspan={8} class="font-semibold">
                    {group.label}
                  </Table.Cell>
                </Table.Row>
                {#each group.rows as row (row.store)}
                  <Table.Row>
                    <Table.Cell class="pl-6">{row.location}</Table.Cell>
                    <Table.Cell class="text-muted-foreground">
                      {row.city || "–"}
                    </Table.Cell>
                    {@render totalsCells(row)}
                  </Table.Row>
                {/each}
                <Table.Row class="font-semibold">
                  <Table.Cell colspan={2}>{group.label} total</Table.Cell>
                  {@render totalsCells(group.total)}
                </Table.Row>
              {/each}
            </Table.Body>
            <Table.Footer>
              <Table.Row class="font-semibold">
                <Table.Cell colspan={2}>Total sales</Table.Cell>
                {@render totalsCells(report.total)}
              </Table.Row>
            </Table.Footer>
          </Table.Root>
        {/if}
      </Card.Content>
    </Card.Root>

    <!-- The assistant receives the page filters as defaults; brand access is
         still enforced server-side against the user scope. -->
    <ChatWidget
      agentId="consolidated-sales-agent"
      title="Consolidated Sales Assistant"
      greeting="Hi! Ask me about sales by company, store or city, transactions and average ticket."
      placeholder="e.g. Which store had the highest average ticket?"
      context={{
        brands: filters.brands,
        from: filters.from,
        to: filters.to,
        channels: filters.channels,
        stores: extras.stores,
        cities: extras.cities,
        weekdays: extras.weekdays,
      }}
    />
  {/if}
</main>
