<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import DateRangeFilter from "$lib/components/date-range-filter.svelte";
  import SalesCompareCard from "$lib/components/sales/sales-compare-card.svelte";
  import SalesLineChart from "$lib/components/sales/sales-line-chart.svelte";
  import { Button, buttonVariants } from "$lib/components/ui/button/index.js";
  import * as ButtonGroup from "$lib/components/ui/button-group/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import * as NativeSelect from "$lib/components/ui/native-select/index.js";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import { formatCompactMoney } from "$lib/services/forecasts/forecast-narrative";
  import {
    formatSalesAmount,
    formatSalesCount,
    formatSalesPct,
    salesDashboardSearch,
    salesPctTone,
    type SalesDashboardFilters,
    type SalesMetricCompare,
  } from "$lib/services/sales-dashboard";
  import ChevronsUpDownIcon from "@lucide/svelte/icons/chevrons-up-down";
  import DownloadIcon from "@lucide/svelte/icons/download";
  import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
  import { toast } from "svelte-sonner";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  let channelFilterOpen = $state(false);
  let selectedChannels = $state<string[]>([]);
  let exporting = $state(false);

  const filters = $derived(data.scope?.filters ?? null);
  const allBrands = $derived(data.scope?.brands ?? []);
  const brand = $derived(
    allBrands.find((item) => item.alias === filters?.brands[0]) ?? null,
  );
  const dashboard = $derived(data.dashboard ?? null);
  const visibleDivisions = $derived(
    (data.divisions ?? []).filter(
      (option) =>
        !filters?.divisionGroup || option.group === filters.divisionGroup,
    ),
  );
  const divisionGroups = $derived([
    ...new Set((data.divisions ?? []).map((option) => option.group)),
  ]);

  const toDate = (day: string) => new Date(`${day}T00:00:00Z`);
  const dailyPoints = $derived(
    (dashboard?.daily ?? []).map((day) => ({
      date: toDate(day.day),
      net: day.net,
      ly: day.lyNet,
      txns: day.txns,
    })),
  );
  const atvPoints = $derived(
    (dashboard?.daily ?? []).flatMap((day) =>
      day.atv === null ? [] : [{ date: toDate(day.day), atv: day.atv }],
    ),
  );
  const weeklyPoints = $derived(
    (dashboard?.weekly ?? []).map((week) => ({
      date: toDate(week.week),
      net: week.net,
    })),
  );

  const money = (value: number) => formatSalesAmount(value);
  const count = (value: number) => formatSalesCount(Math.round(value));
  const maybe = (value: number | null, format: (v: number) => string) =>
    value === null ? "–" : format(value);

  const toneText = {
    good: "text-emerald-700 dark:text-emerald-400",
    warn: "text-amber-700 dark:text-amber-400",
    bad: "text-red-700 dark:text-red-400",
    none: "text-muted-foreground",
  };

  const compareRows: {
    title: string;
    metric: keyof SalesMetricCompare;
    format: (value: number) => string;
  }[] = [
    { title: "Net sales", metric: "net", format: money },
    { title: "Transactions", metric: "txns", format: count },
    { title: "Avg ticket (ATV)", metric: "atv", format: money },
  ];
  const periods = [
    { key: "wtd", label: "WTD" },
    { key: "mtd", label: "MTD" },
    { key: "ytd", label: "YTD" },
  ] as const;

  function href(next: Partial<SalesDashboardFilters>): string {
    if (!filters) {
      return page.url.pathname;
    }
    const search = salesDashboardSearch(
      { ...filters, ...next },
      { allBrands: false },
    );
    return `${page.url.pathname}?${search}`;
  }

  function navigate(next: Partial<SalesDashboardFilters>) {
    goto(href(next), { keepFocus: true, noScroll: true });
  }

  // Stores and divisions belong to the brand, so switching brand clears them.
  const brandHref = (alias: string) =>
    href({
      brands: [alias],
      locationId: null,
      divisionGroup: null,
      divisionName: null,
    });

  function openChannelFilter(open: boolean) {
    if (open && filters) {
      selectedChannels = [...filters.channels];
    }
    channelFilterOpen = open;
  }

  function toggleChannel(channel: string) {
    selectedChannels = selectedChannels.includes(channel)
      ? selectedChannels.filter((value) => value !== channel)
      : [...selectedChannels, channel];
  }

  function applyChannels() {
    channelFilterOpen = false;
    // Every channel ticked is the same as no filter; keep the URL short.
    const all = selectedChannels.length === (data.channels ?? []).length;
    navigate({ channels: all ? [] : selectedChannels });
  }

  function channelSummary(): string {
    const channels = filters?.channels ?? [];
    if (channels.length === 0) return "All channels";
    if (channels.length === 1) return channels[0];
    return `${channels.length} channels`;
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
      Net sales (excl. VAT, returns netted out), transactions and average ticket
      from the POS, compared with the same dates last year.
    </p>
  </section>

  {#if !filters || !dashboard}
    <Card.Root>
      <Card.Content class="text-muted-foreground py-8 text-sm">
        You are not assigned to any brand yet, so there are no sales to show.
        Ask an admin to assign your brands.
      </Card.Content>
    </Card.Root>
  {:else}
    <div class="space-y-2">
      <span class="text-sm font-medium" id="brand-label">Brand</span>
      <ButtonGroup.Root aria-labelledby="brand-label" class="flex-wrap">
        {#each allBrands as item (item.alias)}
          <Button
            href={brandHref(item.alias)}
            variant={item.alias === brand?.alias ? "default" : "outline"}
            aria-current={item.alias === brand?.alias ? "page" : undefined}
          >
            {item.name}
          </Button>
        {/each}
      </ButtonGroup.Root>
    </div>

    <div class="flex flex-wrap items-end gap-3">
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
        <span class="text-sm font-medium">Channel</span>
        <Popover.Root open={channelFilterOpen} onOpenChange={openChannelFilter}>
          <Popover.Trigger
            class={`${buttonVariants({ variant: "outline" })} flex min-w-44 justify-between`}
          >
            <span class="truncate">{channelSummary()}</span>
            <ChevronsUpDownIcon class="size-4 opacity-60" />
          </Popover.Trigger>
          <Popover.Content align="start" class="w-64 p-0">
            <div
              class="flex items-center justify-between gap-2 border-b px-4 py-2"
            >
              <button
                type="button"
                class="text-sm font-medium underline-offset-4 hover:underline"
                onclick={() => (selectedChannels = [...(data.channels ?? [])])}
              >
                Select all
              </button>
              <button
                type="button"
                class="text-muted-foreground hover:text-foreground text-sm font-medium underline-offset-4 hover:underline"
                onclick={() => (selectedChannels = [])}
              >
                Select none
              </button>
            </div>
            <div class="max-h-72 overflow-y-auto p-2">
              {#each data.channels ?? [] as channel (channel)}
                <button
                  type="button"
                  class="hover:bg-accent/50 flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm"
                  onclick={() => toggleChannel(channel)}
                >
                  <Checkbox
                    checked={selectedChannels.includes(channel)}
                    class="pointer-events-none"
                  />
                  {channel}
                </button>
              {/each}
            </div>
            <div
              class="flex items-center justify-between gap-2 border-t px-4 py-3"
            >
              <p class="text-muted-foreground text-xs">
                {selectedChannels.length || "All"} / {(data.channels ?? [])
                  .length} selected
              </p>
              <Button type="button" size="sm" onclick={applyChannels}>
                Apply
              </Button>
            </div>
          </Popover.Content>
        </Popover.Root>
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
                { allBrands: false },
              )}`,
              { keepFocus: true, noScroll: true },
            )}
        />
      </div>

      <Button variant="outline" disabled={exporting} onclick={exportExcel}>
        {#if exporting}
          <LoaderCircleIcon class="size-4 animate-spin" />
        {:else}
          <DownloadIcon class="size-4" />
        {/if}
        Export
      </Button>
    </div>

    <section class="space-y-3">
      <div>
        <h2 class="text-xl font-semibold">Year on year</h2>
        <p class="text-muted-foreground text-sm">
          Week, month and year to {filters.to}, against the same dates last
          year.
        </p>
      </div>
      {#each compareRows as row (row.metric)}
        <div class="grid gap-4 md:grid-cols-3">
          {#each periods as period (period.key)}
            <SalesCompareCard
              title={`${row.title} ${period.label}`}
              description="This year vs last year"
              compare={dashboard.compare[period.key][row.metric]}
              format={row.format}
            />
          {/each}
        </div>
      {/each}
    </section>

    <section class="space-y-3">
      <div>
        <h2 class="text-xl font-semibold">Selected range</h2>
        <p class="text-muted-foreground text-sm">
          {filters.from} to {filters.to}, against the same dates last year.
        </p>
      </div>
      <div class="grid gap-4 md:grid-cols-3">
        <SalesCompareCard
          title="Net sales"
          description="Daily trend"
          compare={dashboard.range.net}
          format={money}
        >
          <SalesLineChart
            data={dailyPoints}
            series={[{ key: "net", label: "Net sales" }]}
            format={money}
            compact
            class="h-16 w-full"
          />
        </SalesCompareCard>
        <SalesCompareCard
          title="Transactions"
          description="Daily trend"
          compare={dashboard.range.txns}
          format={count}
        >
          <SalesLineChart
            data={dailyPoints}
            series={[{ key: "txns", label: "Transactions" }]}
            format={count}
            compact
            class="h-16 w-full"
          />
        </SalesCompareCard>
        <SalesCompareCard
          title="Avg ticket (ATV)"
          description="Daily trend"
          compare={dashboard.range.atv}
          format={money}
        >
          <SalesLineChart
            data={atvPoints}
            series={[{ key: "atv", label: "Avg ticket" }]}
            format={money}
            compact
            class="h-16 w-full"
          />
        </SalesCompareCard>
      </div>
    </section>

    <div class="grid gap-4 lg:grid-cols-2">
      <Card.Root>
        <Card.Header>
          <Card.Title>Net sales by day vs last year</Card.Title>
          <Card.Description>
            Last year is plotted on this year's calendar dates.
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <SalesLineChart
            data={dailyPoints}
            series={[
              { key: "net", label: "This year" },
              { key: "ly", label: "Last year" },
            ]}
            format={formatCompactMoney}
          />
        </Card.Content>
      </Card.Root>
      <Card.Root>
        <Card.Header>
          <Card.Title>Net sales by week (Mon–Sun)</Card.Title>
          <Card.Description>
            Weeks cut at the range edges are partial.
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <SalesLineChart
            data={weeklyPoints}
            series={[{ key: "net", label: "Net sales" }]}
            format={formatCompactMoney}
          />
        </Card.Content>
      </Card.Root>
    </div>

    <Card.Root>
      <Card.Header>
        <Card.Title>Period comparison</Card.Title>
        <Card.Description>
          The selected range, the same dates last year, and the average of the
          same dates over prior years with sales (up to 10).
        </Card.Description>
      </Card.Header>
      <Card.Content>
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.Head>Period</Table.Head>
              <Table.Head class="text-right">Net sales</Table.Head>
              <Table.Head class="text-right">Transactions</Table.Head>
              <Table.Head class="text-right">Avg ticket</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each dashboard.periods as period (period.label)}
              <Table.Row>
                <Table.Cell>{period.label}</Table.Cell>
                <Table.Cell class="text-right tabular-nums">
                  {maybe(period.net, money)}
                </Table.Cell>
                <Table.Cell class="text-right tabular-nums">
                  {maybe(period.txns, count)}
                </Table.Cell>
                <Table.Cell class="text-right tabular-nums">
                  {maybe(period.atv, money)}
                </Table.Cell>
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      </Card.Content>
    </Card.Root>

    <Card.Root>
      <Card.Header>
        <Card.Title>Store breakdown</Card.Title>
        <Card.Description>
          {filters.from} to {filters.to}; changes are against the same dates
          last year (– when the store had no sales then).
        </Card.Description>
      </Card.Header>
      <Card.Content>
        <div class="max-h-[32rem] overflow-auto">
          <Table.Root>
            <Table.Header>
              <Table.Row>
                <Table.Head>Location</Table.Head>
                <Table.Head>Store</Table.Head>
                <Table.Head class="text-right">Net sales</Table.Head>
                <Table.Head class="text-right">vs LY</Table.Head>
                <Table.Head class="text-right">Transactions</Table.Head>
                <Table.Head class="text-right">vs LY</Table.Head>
                <Table.Head class="text-right">Avg ticket</Table.Head>
                <Table.Head class="text-right">vs LY</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {#each data.stores ?? [] as row (`${row.location}|${row.store}`)}
                <Table.Row>
                  <Table.Cell>{row.location}</Table.Cell>
                  <Table.Cell>{row.store}</Table.Cell>
                  <Table.Cell class="text-right tabular-nums">
                    {money(row.net)}
                  </Table.Cell>
                  <Table.Cell
                    class={`text-right tabular-nums ${toneText[salesPctTone(row.netPct)]}`}
                  >
                    {formatSalesPct(row.netPct)}
                  </Table.Cell>
                  <Table.Cell class="text-right tabular-nums">
                    {count(row.txns)}
                  </Table.Cell>
                  <Table.Cell
                    class={`text-right tabular-nums ${toneText[salesPctTone(row.txnsPct)]}`}
                  >
                    {formatSalesPct(row.txnsPct)}
                  </Table.Cell>
                  <Table.Cell class="text-right tabular-nums">
                    {maybe(row.atv, money)}
                  </Table.Cell>
                  <Table.Cell
                    class={`text-right tabular-nums ${toneText[salesPctTone(row.atvPct)]}`}
                  >
                    {formatSalesPct(row.atvPct)}
                  </Table.Cell>
                </Table.Row>
              {:else}
                <Table.Row>
                  <Table.Cell colspan={8} class="text-muted-foreground">
                    No sales in this range.
                  </Table.Cell>
                </Table.Row>
              {/each}
            </Table.Body>
          </Table.Root>
        </div>
      </Card.Content>
    </Card.Root>

    <Card.Root>
      <Card.Header>
        <Card.Title>Daily breakdown</Card.Title>
        <Card.Description>{filters.from} to {filters.to}</Card.Description>
      </Card.Header>
      <Card.Content>
        <div class="max-h-[32rem] overflow-auto">
          <Table.Root>
            <Table.Header>
              <Table.Row>
                <Table.Head>Date</Table.Head>
                <Table.Head class="text-right">Net sales</Table.Head>
                <Table.Head class="text-right">Last year</Table.Head>
                <Table.Head class="text-right">vs LY</Table.Head>
                <Table.Head class="text-right">Transactions</Table.Head>
                <Table.Head class="text-right">Avg ticket</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {#each dashboard.daily as day (day.day)}
                <Table.Row>
                  <Table.Cell class="tabular-nums">{day.day}</Table.Cell>
                  <Table.Cell class="text-right tabular-nums">
                    {money(day.net)}
                  </Table.Cell>
                  <Table.Cell class="text-right tabular-nums">
                    {money(day.lyNet)}
                  </Table.Cell>
                  <Table.Cell
                    class={`text-right tabular-nums ${toneText[salesPctTone(day.lyPct)]}`}
                  >
                    {formatSalesPct(day.lyPct)}
                  </Table.Cell>
                  <Table.Cell class="text-right tabular-nums">
                    {count(day.txns)}
                  </Table.Cell>
                  <Table.Cell class="text-right tabular-nums">
                    {maybe(day.atv, money)}
                  </Table.Cell>
                </Table.Row>
              {/each}
            </Table.Body>
          </Table.Root>
        </div>
      </Card.Content>
    </Card.Root>
  {/if}
</main>
