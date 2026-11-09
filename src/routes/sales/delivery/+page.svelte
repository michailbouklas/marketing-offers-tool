<script lang="ts">
  import SalesLineChart from "$lib/components/sales/sales-line-chart.svelte";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Chart from "$lib/components/ui/chart/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import { reasonColor } from "$lib/services/aggregator-kpis/reason-palette";
  import { formatCompactMoney } from "$lib/services/forecasts/forecast-narrative";
  import {
    formatSalesAmount,
    formatSalesCount,
  } from "$lib/services/sales-dashboard";
  import type { DeliveryTotals } from "$lib/services/sales-delivery";
  import { BarChart, PieChart } from "layerchart";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const filters = $derived(data.scope?.filters ?? null);
  const dashboard = $derived(data.dashboard ?? null);
  const channel = $derived(data.channel ?? null);

  const money = (value: number) => formatSalesAmount(value);
  const count = (value: number) => formatSalesCount(Math.round(value));
  const compactCount = new Intl.NumberFormat("en-GB", { notation: "compact" })
    .format;
  const maybeMoney = (value: number | null) =>
    value === null ? "–" : money(value);
  const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

  const toDate = (day: string) => new Date(`${day}T00:00:00Z`);
  const dailyPoints = $derived(
    (dashboard?.daily ?? []).map((day) => ({
      date: toDate(day.day),
      net: day.net,
    })),
  );
  const atvPoints = $derived(
    (dashboard?.daily ?? []).flatMap((day) =>
      day.atv === null ? [] : [{ date: toDate(day.day), atv: day.atv }],
    ),
  );
  const monthlyPoints = $derived(
    (dashboard?.monthly ?? []).map((month) => ({
      // "01/26": short enough for 12 bars in a half-width card.
      month: `${month.month.slice(5, 7)}/${month.month.slice(2, 4)}`,
      net: month.net,
      orders: month.orders,
    })),
  );
  // Channel names have spaces, so chart keys are positional (c0, c1, …).
  const channelSlices = $derived(
    (dashboard?.channels ?? []).map((item, index) => ({
      key: `c${index}`,
      label: item.channel,
      value: item.net,
      share: item.share,
      color: reasonColor(index),
    })),
  );
  const channelConfig = $derived(
    Object.fromEntries(
      channelSlices.map((slice) => [
        slice.key,
        { label: slice.label, color: slice.color },
      ]),
    ) satisfies Chart.ChartConfig,
  );
  const barConfig = {
    net: { label: "Net sales", color: reasonColor(0) },
    orders: { label: "Orders", color: reasonColor(1) },
  } satisfies Chart.ChartConfig;

  const tiles = (totals: DeliveryTotals, last: "gross" | "discount") => [
    { label: "Net sales", value: formatCompactMoney(totals.net) },
    { label: "Orders", value: count(totals.orders) },
    { label: "Avg ticket", value: maybeMoney(totals.atv) },
    last === "gross"
      ? { label: "Gross sales", value: formatCompactMoney(totals.gross) }
      : { label: "Discounts", value: formatCompactMoney(totals.discount) },
  ];
</script>

<svelte:head>
  <title>Delivery Sales | Aggregator Offers Tool</title>
</svelte:head>

{#snippet tileRow(items: { label: string; value: string }[])}
  <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
    {#each items as tile (tile.label)}
      <Card.Root>
        <Card.Header>
          <Card.Description>{tile.label}</Card.Description>
          <Card.Title class="text-3xl tabular-nums">{tile.value}</Card.Title>
        </Card.Header>
      </Card.Root>
    {/each}
  </div>
{/snippet}

{#if filters && dashboard}
  <section class="space-y-3">
    <h2 class="text-xl font-semibold">
      {filters.from} to {filters.to}
    </h2>
    {@render tileRow(tiles(dashboard.range, "gross"))}
  </section>

  <section class="space-y-3">
    <h2 class="text-xl font-semibold">
      Month to date ({filters.to.slice(0, 8)}01 to {filters.to})
    </h2>
    {@render tileRow(tiles(dashboard.mtd, "discount"))}
  </section>

  <div class="grid gap-4 lg:grid-cols-2">
    <Card.Root>
      <Card.Header>
        <Card.Title>Daily net sales</Card.Title>
      </Card.Header>
      <Card.Content>
        <SalesLineChart
          data={dailyPoints}
          series={[{ key: "net", label: "Net sales" }]}
          format={formatCompactMoney}
        />
      </Card.Content>
    </Card.Root>
    <Card.Root>
      <Card.Header>
        <Card.Title>Daily avg ticket</Card.Title>
      </Card.Header>
      <Card.Content>
        <SalesLineChart
          data={atvPoints}
          series={[{ key: "atv", label: "Avg ticket" }]}
          format={money}
        />
      </Card.Content>
    </Card.Root>
  </div>

  <div class="grid gap-4 lg:grid-cols-2">
    {#each [{ key: "net", title: "Monthly net sales", format: formatCompactMoney }, { key: "orders", title: "Monthly orders", format: compactCount }] as bar (bar.key)}
      <Card.Root>
        <Card.Header>
          <Card.Title>{bar.title}</Card.Title>
          <Card.Description>
            Months cut by the date range are partial.
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <Chart.Container config={barConfig} class="h-64 w-full">
            <BarChart
              data={monthlyPoints}
              x="month"
              series={[
                {
                  key: bar.key,
                  label: barConfig[bar.key as "net" | "orders"].label,
                  color: `var(--color-${bar.key})`,
                },
              ]}
              props={{ yAxis: { format: bar.format } }}
            >
              {#snippet tooltip()}
                <Chart.Tooltip indicator="dot" />
              {/snippet}
            </BarChart>
          </Chart.Container>
        </Card.Content>
      </Card.Root>
    {/each}
  </div>

  <div class="grid gap-4 lg:grid-cols-3">
    <Card.Root class={channel === null ? "lg:col-span-2" : "lg:col-span-3"}>
      <Card.Header>
        <Card.Title>Net sales by location</Card.Title>
        <Card.Description>
          {channel ?? "All delivery channels"}, {filters.from} to {filters.to}.
        </Card.Description>
      </Card.Header>
      <Card.Content>
        <div class="max-h-[32rem] overflow-auto">
          <Table.Root>
            <Table.Header>
              <Table.Row>
                <Table.Head>Location</Table.Head>
                <Table.Head class="text-right">Net sales</Table.Head>
                <Table.Head class="text-right">Share</Table.Head>
                <Table.Head class="text-right">Orders</Table.Head>
                <Table.Head class="text-right">Avg ticket</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {#each dashboard.locations as row (row.location)}
                <Table.Row>
                  <Table.Cell>{row.location}</Table.Cell>
                  <Table.Cell class="text-right tabular-nums">
                    {money(row.net)}
                  </Table.Cell>
                  <Table.Cell class="text-right tabular-nums">
                    {pct(row.share)}
                  </Table.Cell>
                  <Table.Cell class="text-right tabular-nums">
                    {count(row.orders)}
                  </Table.Cell>
                  <Table.Cell class="text-right tabular-nums">
                    {maybeMoney(row.atv)}
                  </Table.Cell>
                </Table.Row>
              {:else}
                <Table.Row>
                  <Table.Cell colspan={5} class="text-muted-foreground">
                    No sales on this channel in this range.
                  </Table.Cell>
                </Table.Row>
              {/each}
            </Table.Body>
          </Table.Root>
        </div>
      </Card.Content>
    </Card.Root>

    {#if channel === null}
      <Card.Root>
        <Card.Header>
          <Card.Title>Sales share by channel</Card.Title>
          <Card.Description
            >Net sales, {filters.from} to {filters.to}.</Card.Description
          >
        </Card.Header>
        <Card.Content class="space-y-4">
          <Chart.Container
            config={channelConfig}
            class="mx-auto aspect-square h-56"
          >
            <PieChart
              data={channelSlices}
              key="key"
              label="label"
              value="value"
              c="color"
              innerRadius={0.6}
            >
              {#snippet tooltip()}
                <Chart.Tooltip hideLabel />
              {/snippet}
            </PieChart>
          </Chart.Container>
          <ul class="space-y-1 text-sm">
            {#each channelSlices as slice (slice.key)}
              <li class="flex items-center gap-2">
                <span
                  class="size-2.5 shrink-0 rounded-[2px]"
                  style={`background-color: ${slice.color}`}
                ></span>
                <span class="flex-1">{slice.label}</span>
                <span class="tabular-nums"
                  >{formatCompactMoney(slice.value)}</span
                >
                <span
                  class="text-muted-foreground w-14 text-right tabular-nums"
                >
                  {pct(slice.share)}
                </span>
              </li>
            {/each}
          </ul>
        </Card.Content>
      </Card.Root>
    {/if}
  </div>
{/if}
