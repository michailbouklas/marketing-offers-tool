<script lang="ts">
  import { page } from "$app/state";
  import SalesLineChart from "$lib/components/sales/sales-line-chart.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as ButtonGroup from "$lib/components/ui/button-group/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import { formatCompactMoney } from "$lib/services/forecasts/forecast-narrative";
  import {
    formatSalesAmount,
    formatSalesCount,
  } from "$lib/services/sales-dashboard";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const vs = $derived(data.vs ?? null);
  const money = (value: number) => formatSalesAmount(value);
  const maybeMoney = (value: number | null) =>
    value === null ? "–" : money(value);
  const pct = (value: number | null) =>
    value === null ? "–" : `${(value * 100).toFixed(1)}%`;

  /** Toggle one channel in the comparison; at least two stay picked. */
  function toggleHref(channel: string): string {
    const current = vs?.channels ?? [];
    const next = current.includes(channel)
      ? current.filter((c) => c !== channel)
      : [...current, channel];
    const search = new URLSearchParams(page.url.search);
    search.set("vs", next.join(","));
    return `${page.url.pathname}?${search}`;
  }

  // Chart keys must be CSS-safe, channel names are not ("Wolt GR").
  const series = $derived(
    (vs?.channels ?? []).map((channel, i) => ({
      key: `c${i}`,
      label: channel,
    })),
  );
  const toDate = (day: string) => new Date(`${day}T00:00:00Z`);
  const netPoints = $derived(
    (vs?.weeks ?? []).map((week) => ({
      date: toDate(week.week),
      ...Object.fromEntries(week.net.map((net, i) => [`c${i}`, net])),
    })),
  );
  // Every point needs every series key, so weeks where a picked channel had no orders are skipped.
  const atvPoints = $derived(
    (vs?.weeks ?? []).flatMap((week) =>
      week.atv.some((value) => value === null)
        ? []
        : [
            {
              date: toDate(week.week),
              ...Object.fromEntries(week.atv.map((atv, i) => [`c${i}`, atv!])),
            },
          ],
    ),
  );

  type Row = (typeof vs & {})["table"][number];
  const metrics: {
    label: string;
    value: (row: Row) => number | null;
    format: (value: number | null) => string;
    /** Which end wins; null = no winner (context only). */
    best: "high" | "low" | null;
  }[] = [
    {
      label: "Net sales",
      value: (r) => r.net,
      format: (v) => maybeMoney(v),
      best: "high",
    },
    {
      label: "Share of delivery",
      value: (r) => r.share,
      format: pct,
      best: "high",
    },
    {
      label: "Orders",
      value: (r) => r.orders,
      format: (v) => (v === null ? "–" : formatSalesCount(v)),
      best: "high",
    },
    {
      label: "Avg ticket",
      value: (r) => r.atv,
      format: maybeMoney,
      best: "high",
    },
    {
      label: "Gross sales",
      value: (r) => r.gross,
      format: maybeMoney,
      best: "high",
    },
    {
      label: "Discount rate (of gross)",
      value: (r) => r.discountRate,
      format: pct,
      best: null,
    },
    {
      label: "Discount rate (of net)",
      value: (r) => r.discountRateNet,
      format: pct,
      best: null,
    },
    {
      label: "Month-to-date net",
      value: (r) => r.mtdNet,
      format: maybeMoney,
      best: "high",
    },
  ];

  function isBest(metric: (typeof metrics)[number], row: Row): boolean {
    if (!vs || !metric.best) return false;
    const values = vs.table
      .map(metric.value)
      .filter((v): v is number => v !== null);
    const value = metric.value(row);
    if (value === null || values.length < 2) return false;
    return (
      value ===
      (metric.best === "high" ? Math.max(...values) : Math.min(...values))
    );
  }
</script>

<svelte:head>
  <title>Channel VS | Delivery Sales | Aggregator Offers Tool</title>
</svelte:head>

{#if vs}
  <div class="space-y-2">
    <span class="text-sm font-medium" id="vs-label">Compare channels</span>
    <ButtonGroup.Root aria-labelledby="vs-label" class="flex-wrap">
      {#each vs.available as channel (channel)}
        {@const picked = vs.channels.includes(channel)}
        {@const locked = picked && vs.channels.length <= 2}
        <Button
          href={locked ? undefined : toggleHref(channel)}
          aria-disabled={locked}
          variant={picked ? "default" : "outline"}
          aria-pressed={picked}
          title={locked
            ? "Pick another channel first: at least two are compared"
            : undefined}
        >
          {channel}
        </Button>
      {/each}
    </ButtonGroup.Root>
    {#if vs.available.length < 2}
      <p class="text-muted-foreground text-sm">
        This brand sold on only one delivery channel in this range, so there is
        nothing to compare.
      </p>
    {/if}
  </div>

  <Card.Root>
    <Card.Header>
      <Card.Title>Head to head</Card.Title>
      <Card.Description>
        Green = best of the picked channels. Avg ticket differences partly
        reflect each channel's menu prices; discounts are recorded on the order,
        not who funds them.
      </Card.Description>
    </Card.Header>
    <Card.Content class="overflow-x-auto">
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head>Metric</Table.Head>
            {#each vs.table as row (row.channel)}
              <Table.Head class="text-right">{row.channel}</Table.Head>
            {/each}
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each metrics as metric (metric.label)}
            <Table.Row>
              <Table.Cell>{metric.label}</Table.Cell>
              {#each vs.table as row (row.channel)}
                <Table.Cell
                  class={`text-right tabular-nums ${isBest(metric, row) ? "font-semibold text-emerald-700 dark:text-emerald-400" : ""}`}
                >
                  {metric.format(metric.value(row))}
                </Table.Cell>
              {/each}
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    </Card.Content>
  </Card.Root>

  <div class="grid gap-4 lg:grid-cols-2">
    <Card.Root>
      <Card.Header>
        <Card.Title>Weekly net sales</Card.Title>
        <Card.Description
          >Mon–Sun; weeks cut by the range are partial.</Card.Description
        >
      </Card.Header>
      <Card.Content>
        <SalesLineChart data={netPoints} {series} format={formatCompactMoney} />
      </Card.Content>
    </Card.Root>
    <Card.Root>
      <Card.Header>
        <Card.Title>Weekly avg ticket</Card.Title>
        <Card.Description
          >Weeks where a picked channel had no orders are skipped.</Card.Description
        >
      </Card.Header>
      <Card.Content>
        <SalesLineChart data={atvPoints} {series} format={money} />
      </Card.Content>
    </Card.Root>
  </div>

  <Card.Root>
    <Card.Header>
      <Card.Title>Net sales by location</Card.Title>
      <Card.Description>
        Each channel's net and its share of the location's net across the picked
        channels.
      </Card.Description>
    </Card.Header>
    <Card.Content>
      <div class="max-h-[32rem] overflow-auto">
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.Head>Location</Table.Head>
              {#each vs.channels as channel (channel)}
                <Table.Head class="text-right">{channel}</Table.Head>
              {/each}
              <Table.Head class="text-right">Total</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each vs.locations as row (row.location)}
              <Table.Row>
                <Table.Cell>{row.location}</Table.Cell>
                {#each row.net as net, i (vs.channels[i])}
                  <Table.Cell class="text-right tabular-nums">
                    {formatCompactMoney(net)}
                    <span class="text-muted-foreground text-xs">
                      {pct(row.total === 0 ? null : net / row.total)}
                    </span>
                  </Table.Cell>
                {/each}
                <Table.Cell class="text-right tabular-nums">
                  {formatCompactMoney(row.total)}
                </Table.Cell>
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      </div>
    </Card.Content>
  </Card.Root>
{/if}
