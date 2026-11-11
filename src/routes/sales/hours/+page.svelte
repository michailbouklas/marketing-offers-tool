<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import DateRangeFilter from "$lib/components/date-range-filter.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as ButtonGroup from "$lib/components/ui/button-group/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as NativeSelect from "$lib/components/ui/native-select/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import DownloadIcon from "@lucide/svelte/icons/download";
  import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
  import { toast } from "svelte-sonner";
  import {
    formatSalesAmount,
    formatSalesCount,
    salesDashboardSearch,
    type SalesDashboardFilters,
  } from "$lib/services/sales-dashboard";
  import {
    DEAD_HOUR_SHARE,
    isDateView,
    isGroupedByDay,
    WEEKDAY_LABELS,
    type ChannelValue,
    type HeatCell,
  } from "$lib/services/sales-hours";
  import { formatCompactMoney } from "$lib/services/forecasts/forecast-narrative";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  let metric = $state<"net" | "txns">("net");
  let exporting = $state(false);

  const byDay = $derived(isGroupedByDay(page.url.searchParams));
  const dateView = $derived(isDateView(page.url.searchParams));
  const calendar = $derived(data.calendar ?? null);
  const breakdown = $derived(data.breakdown ?? null);
  const channelVs = $derived(breakdown !== null);

  const filters = $derived(data.scope?.filters ?? null);
  const allBrands = $derived(data.scope?.brands ?? []);
  const grid = $derived(data.grid ?? null);
  const divisionGroups = $derived([
    ...new Set((data.divisions ?? []).map((option) => option.group)),
  ]);

  const hourLabel = (hour: number) => `${String(hour).padStart(2, "0")}:00`;
  const money = (value: number) => formatSalesAmount(value);
  const cellValue = (cell: HeatCell) =>
    metric === "net"
      ? formatCompactMoney(cell.avgNet)
      : formatSalesCount(Math.round(cell.avgTxns));
  const dateLabel = (date: string) =>
    new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });

  type ViewMode = { grouped: boolean; dates: boolean; vs: boolean };

  /** Same page, new filters; view toggles survive unless overridden. VS drops with a channel filter. */
  function href(
    next: Partial<SalesDashboardFilters>,
    mode: Partial<ViewMode> = {},
  ): string {
    if (!filters) return page.url.pathname;
    const merged = { ...filters, ...next };
    const { grouped, dates, vs } = {
      grouped: byDay,
      dates: dateView,
      vs: channelVs,
      ...mode,
    };
    const search = new URLSearchParams(
      salesDashboardSearch(merged, { allBrands: false }),
    );
    if (grouped) search.set("by", "day");
    if (grouped && dates) search.set("view", "dates");
    if (vs && merged.channels.length === 0) search.set("vs", "1");
    return `${page.url.pathname}?${search}`;
  }

  function navigate(
    next: Partial<SalesDashboardFilters>,
    mode: Partial<ViewMode> = {},
  ) {
    goto(href(next, mode), { keepFocus: true, noScroll: true });
  }

  const metricOf = (value: ChannelValue) =>
    metric === "net" ? value.net : value.txns;
  const formatMetric = (value: number) =>
    metric === "net"
      ? formatCompactMoney(value)
      : formatSalesCount(Math.round(value));

  /** Green = biggest channel in the cell, red = smallest; nothing when they tie. */
  function channelTone(values: ChannelValue[], value: ChannelValue): string {
    const all = values.map(metricOf);
    const max = Math.max(...all);
    const min = Math.min(...all);
    if (max === min) return "";
    if (metricOf(value) === max) return "bg-emerald-600 text-white";
    if (metricOf(value) === min) return "bg-red-600 text-white";
    return "";
  }

  const channelTitle = (values: ChannelValue[] | undefined) =>
    values
      ? `\n${values.map((v) => `${v.channel}: ${money(v.net)} net, ${v.txns.toFixed(1)} orders`).join("\n")}`
      : "";

  /** Server rebuilds the grid from the same URL, then we follow the download URL. */
  async function exportExcel() {
    exporting = true;
    const toastId = toast.loading("Preparing the Excel export…");
    try {
      const response = await fetch(
        `${page.url.pathname}/export${page.url.search}`,
        { method: "POST" },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(body?.message ?? `Export failed (${response.status})`);
      }
      const { downloadUrl } = (await response.json()) as {
        downloadUrl: string;
      };
      window.location.assign(downloadUrl);
      toast.success("Excel export ready, downloading.", { id: toastId });
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "The Excel export could not be generated.",
        { id: toastId },
      );
    } finally {
      exporting = false;
    }
  }

  function selectValue(event: Event): string | null {
    const value = (event.currentTarget as HTMLSelectElement).value;
    return value === "" ? null : value;
  }
</script>

{#snippet channelLines(values: ChannelValue[] | undefined)}
  {#if values?.length}
    <div class="flex w-full flex-col gap-px text-[10px] leading-tight">
      {#each values as value (value.channel)}
        <div
          class={`flex justify-between gap-1 rounded-sm px-1 ${channelTone(values, value)}`}
        >
          <span class="truncate">{value.channel}</span>
          <span>{formatMetric(metricOf(value))}</span>
        </div>
      {/each}
    </div>
  {/if}
{/snippet}

<svelte:head>
  <title>Busy & Dead Hours | Aggregator Offers Tool</title>
</svelte:head>

<main
  class="mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10"
>
  <section class="space-y-2">
    <h1 class="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
      Busy & dead hours
    </h1>
    <p class="text-muted-foreground max-w-3xl text-base leading-7">
      Average net sales (excl. VAT) and orders per weekday and hour, from the
      POS order time. Weekdays follow the POS business day, so orders after
      midnight count towards the evening before.
    </p>
  </section>

  {#if !filters || !grid}
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
            href={href({
              brands: [item.alias],
              locationId: null,
              divisionGroup: null,
              divisionName: null,
              channels: [],
            })}
            variant={item.alias === filters.brands[0] ? "default" : "outline"}
            aria-current={item.alias === filters.brands[0] ? "page" : undefined}
          >
            {item.name}
          </Button>
        {/each}
      </ButtonGroup.Root>
    </div>

    <div class="space-y-2">
      <span class="text-sm font-medium" id="channel-label">Channel</span>
      <div class="flex flex-wrap items-center gap-3">
        <ButtonGroup.Root aria-labelledby="channel-label" class="flex-wrap">
          <Button
            href={href({ channels: [] })}
            variant={filters.channels.length === 0 ? "default" : "outline"}
            aria-current={filters.channels.length === 0 ? "page" : undefined}
          >
            All channels
          </Button>
          {#each data.channels ?? [] as channel (channel)}
            {@const active =
              filters.channels.length === 1 && filters.channels[0] === channel}
            <Button
              href={href({ channels: [channel] })}
              variant={active ? "default" : "outline"}
              aria-current={active ? "page" : undefined}
            >
              {channel}
            </Button>
          {/each}
        </ButtonGroup.Root>
        {#if filters.channels.length === 0}
          <div class="flex items-center gap-2">
            <Switch
              id="channel-vs"
              checked={channelVs}
              onCheckedChange={(checked) => navigate({}, { vs: checked })}
            />
            <Label for="channel-vs">VS</Label>
          </div>
        {/if}
      </div>
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
          onchange={(event) =>
            navigate({ divisionGroup: selectValue(event), divisionName: null })}
        >
          <NativeSelect.Option value="">All groups</NativeSelect.Option>
          {#each divisionGroups as group (group)}
            <NativeSelect.Option value={group}>{group}</NativeSelect.Option>
          {/each}
        </NativeSelect.Root>
      </div>

      <div class="space-y-2">
        <span class="text-sm font-medium">Date range</span>
        <DateRangeFilter
          from={filters.from}
          to={filters.to}
          onApply={(range) =>
            navigate({ from: range.from ?? "", to: range.to ?? "" })}
        />
      </div>

      <div class="space-y-2">
        <span class="text-sm font-medium" id="metric-label">Show</span>
        <ButtonGroup.Root aria-labelledby="metric-label">
          <Button
            variant={metric === "net" ? "default" : "outline"}
            aria-pressed={metric === "net"}
            onclick={() => (metric = "net")}
          >
            Net sales
          </Button>
          <Button
            variant={metric === "txns" ? "default" : "outline"}
            aria-pressed={metric === "txns"}
            onclick={() => (metric = "txns")}
          >
            Orders
          </Button>
        </ButtonGroup.Root>
      </div>

      <div class="flex h-9 items-center gap-2">
        <Switch
          id="group-by-day"
          checked={byDay}
          onCheckedChange={(checked) => navigate({}, { grouped: checked })}
        />
        <Label for="group-by-day">Group by day</Label>
      </div>

      <Button
        variant="outline"
        class="ml-auto"
        disabled={exporting || grid.hours.length === 0}
        onclick={exportExcel}
      >
        {#if exporting}
          <LoaderCircleIcon class="size-4 animate-spin" />
          Working…
        {:else}
          <DownloadIcon class="size-4" />
          Export to Excel
        {/if}
      </Button>
    </div>

    <div class="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {#each grid.dayparts as part (part.key)}
        <Card.Root>
          <Card.Header>
            <Card.Description>{part.label}</Card.Description>
            <Card.Title class="text-2xl tabular-nums">
              {Math.round(part.share * 100)}%
            </Card.Title>
          </Card.Header>
          <Card.Content class="text-muted-foreground text-sm tabular-nums">
            {money(part.net)} net
          </Card.Content>
        </Card.Root>
      {/each}
    </div>

    <Card.Root>
      <Card.Header>
        <Card.Title>
          {dateView ? "Daily sales" : "Average per day"}, {filters.from} to {filters.to}
        </Card.Title>
        {#if byDay}
          <Card.Action>
            <ButtonGroup.Root aria-label="Day grouping">
              <Button
                size="sm"
                href={href({}, { dates: false })}
                variant={dateView ? "outline" : "default"}
                aria-current={dateView ? undefined : "page"}
              >
                Weekday average
              </Button>
              <Button
                size="sm"
                href={href({}, { dates: true })}
                variant={dateView ? "default" : "outline"}
                aria-current={dateView ? "page" : undefined}
              >
                By date
              </Button>
            </ButtonGroup.Root>
          </Card.Action>
        {/if}
        <Card.Description>
          {#if dateView}
            {#if calendar?.peak}
              Busiest date: {dateLabel(calendar.peak.date)} ({money(
                calendar.peak.net,
              )}).
            {/if}
            Totals per POS business day. Empty cells mean no sales that day.
          {:else if byDay}
            {#if grid.peakDay}
              Busiest day: {WEEKDAY_LABELS[grid.peakDay.weekday - 1]} ({money(
                grid.peakDay.avgNet,
              )} per day). Empty cells mean no sales on that weekday.
            {/if}
          {:else}
            {#if grid.peak}
              Busiest hour: {WEEKDAY_LABELS[grid.peak.weekday - 1]}
              {hourLabel(grid.peak.hour)} ({money(grid.peak.avgNet)} per day).
            {/if}
            <span class="font-medium text-amber-700 dark:text-amber-400">
              {grid.deadCount} dead hours
            </span>
            (at least one order a day, but under {Math.round(
              DEAD_HOUR_SHARE * 100,
            )}% of the busiest hour's sales). Empty cells mean no sales at that
            hour.
          {/if}
        </Card.Description>
      </Card.Header>
      <Card.Content>
        {#if grid.hours.length === 0}
          <p class="text-muted-foreground text-sm">No sales in this range.</p>
        {:else if dateView && calendar}
          <div class="space-y-6">
            {#each calendar.months as month (month.key)}
              <section class="space-y-2" aria-label={month.label}>
                <h3 class="text-sm font-medium">{month.label}</h3>
                <div class="grid grid-cols-7 gap-0.5 text-xs">
                  {#each WEEKDAY_LABELS as label (label)}
                    <div
                      class="text-muted-foreground py-1 text-center font-medium"
                    >
                      {label}
                    </div>
                  {/each}
                  {#each { length: month.offset }, index (index)}
                    <div></div>
                  {/each}
                  {#each month.cells as cell (cell.date)}
                    <div
                      class={`relative flex min-h-14 items-center justify-center rounded text-sm tabular-nums ${breakdown ? "px-1 pt-5 pb-1" : ""} ${cell.inRange ? "" : "opacity-30"} ${cell.intensity > 0.55 ? "text-primary-foreground" : ""}`}
                      style={`background-color: color-mix(in oklch, var(--primary) ${Math.round(cell.intensity * 100)}%, transparent)`}
                      title={cell.inRange
                        ? `${dateLabel(cell.date)}: ${money(cell.net)} net, ${cell.txns} orders, ATV ${cell.atv === null ? "–" : money(cell.atv)}${channelTitle(breakdown?.[cell.date])}`
                        : `${dateLabel(cell.date)}: outside the date range`}
                    >
                      <span
                        class="absolute top-1 left-1.5 text-[10px] opacity-70"
                      >
                        {cell.day}
                      </span>
                      {#if breakdown}
                        {@render channelLines(
                          cell.inRange ? breakdown[cell.date] : undefined,
                        )}
                      {:else if cell.net > 0}
                        {metric === "net"
                          ? formatCompactMoney(cell.net)
                          : formatSalesCount(cell.txns)}
                      {/if}
                    </div>
                  {/each}
                </div>
              </section>
            {/each}
          </div>
        {:else if byDay}
          <div class="overflow-x-auto">
            <table class="w-full border-separate border-spacing-0.5 text-xs">
              <thead>
                <tr>
                  {#each WEEKDAY_LABELS as label (label)}
                    <th
                      scope="col"
                      class="text-muted-foreground px-1 py-1 font-medium"
                    >
                      {label}
                    </th>
                  {/each}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {#each grid.weekdays as cell, index (index)}
                    <td
                      class={`h-14 min-w-16 rounded px-1 text-center text-sm tabular-nums ${breakdown ? "py-1" : ""} ${cell.intensity > 0.55 ? "text-primary-foreground" : ""}`}
                      style={`background-color: color-mix(in oklch, var(--primary) ${Math.round(cell.intensity * 100)}%, transparent)`}
                      title={`${WEEKDAY_LABELS[index]}: ${money(cell.avgNet)} net, ${cell.avgTxns.toFixed(1)} orders, ATV ${cell.atv === null ? "–" : money(cell.atv)}${channelTitle(breakdown?.[`${index + 1}`])}`}
                    >
                      {#if breakdown}
                        {@render channelLines(breakdown[`${index + 1}`])}
                      {:else}
                        {cell.avgNet > 0 ? cellValue(cell) : ""}
                      {/if}
                    </td>
                  {/each}
                </tr>
              </tbody>
            </table>
          </div>
        {:else}
          <div class="overflow-x-auto">
            <table class="w-full border-separate border-spacing-0.5 text-xs">
              <thead>
                <tr>
                  <th scope="col" class="sr-only">Weekday</th>
                  {#each grid.hours as hour (hour)}
                    <th
                      scope="col"
                      class="text-muted-foreground px-1 py-1 font-medium tabular-nums"
                    >
                      {String(hour).padStart(2, "0")}
                    </th>
                  {/each}
                </tr>
              </thead>
              <tbody>
                {#each grid.rows as row, index (index)}
                  <tr>
                    <th scope="row" class="pr-2 text-left font-medium">
                      {WEEKDAY_LABELS[index]}
                    </th>
                    {#each row as cell, column (grid.hours[column])}
                      <td
                        class={`h-10 rounded px-1 text-center tabular-nums ${breakdown ? "min-w-24 py-1" : "min-w-11"} ${cell.dead ? "ring-2 ring-amber-500 ring-inset" : ""} ${cell.intensity > 0.55 ? "text-primary-foreground" : ""}`}
                        style={`background-color: color-mix(in oklch, var(--primary) ${Math.round(cell.intensity * 100)}%, transparent)`}
                        title={`${WEEKDAY_LABELS[index]} ${hourLabel(grid.hours[column])}: ${money(cell.avgNet)} net, ${cell.avgTxns.toFixed(1)} orders, ATV ${cell.atv === null ? "–" : money(cell.atv)}${cell.dead ? " (dead hour)" : ""}${channelTitle(breakdown?.[`${index + 1}|${grid.hours[column]}`])}`}
                      >
                        {#if breakdown}
                          {@render channelLines(
                            breakdown[`${index + 1}|${grid.hours[column]}`],
                          )}
                        {:else}
                          {cell.avgNet > 0 ? cellValue(cell) : ""}
                        {/if}
                      </td>
                    {/each}
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </Card.Content>
    </Card.Root>
  {/if}
</main>
