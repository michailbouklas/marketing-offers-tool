<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import DeltaBadge from "$lib/components/aggregator-kpis/widgets/delta-badge.svelte";
  import {
    formatMoney,
    formatNumber,
    formatPeriodLong,
    type MetricRow,
    type PeriodKind,
  } from "$lib/services/aggregator-kpis/aggregator-kpis";

  let {
    title = "Metrics by store",
    description = "Sales, orders, and average basket for the latest completed period.",
    data,
    period,
    linkStores = false,
    showPeriod = false,
  }: {
    title?: string;
    description?: string;
    data: MetricRow[];
    period: PeriodKind;
    /** When true, link each store name to its metrics history page. */
    linkStores?: boolean;
    /** When true, show a Period column instead of the store name column. */
    showPeriod?: boolean;
  } = $props();

  // Wolt rows carry portal deltas + a today-scoped completedOrders; the latter
  // isn't a period figure, so the Completed column is hidden for Wolt.
  const isWolt = $derived(data.some((row) => row.aggregator === "WOLT"));
</script>

<Card.Root>
  <Card.Header>
    <Card.Title>{title}</Card.Title>
    <Card.Description>{description}</Card.Description>
  </Card.Header>
  <Card.Content>
    {#if data.length === 0}
      <p class="text-muted-foreground text-sm">
        No metrics data for the current filters.
      </p>
    {:else}
      <div class="overflow-x-auto">
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.Head>{showPeriod ? "Period" : "Store"}</Table.Head>
              <Table.Head class="text-right">Sales</Table.Head>
              <Table.Head class="text-right">Orders</Table.Head>
              <Table.Head class="text-right">Avg basket</Table.Head>
              {#if !isWolt}
                <Table.Head class="text-right">Completed</Table.Head>
              {/if}
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each data as row (showPeriod ? row.periodStart : row.storeId)}
              <Table.Row>
                <Table.Cell class="font-medium whitespace-nowrap">
                  {#if showPeriod}
                    {formatPeriodLong(row.periodStart, row.periodEnd, period)}
                  {:else if linkStores}
                    <a
                      href={`/aggregator-kpis/metrics/${row.storeId}`}
                      class="hover:text-primary hover:underline"
                    >
                      {row.storeName ?? `Store #${row.storeId}`}
                    </a>
                  {:else}
                    {row.storeName ?? `Store #${row.storeId}`}
                  {/if}
                </Table.Cell>
                <Table.Cell class="text-right tabular-nums">
                  <div class="flex flex-col items-end gap-1">
                    <span>{formatMoney(row.sales)}</span>
                    <DeltaBadge delta={row.deltas?.sales} />
                  </div>
                </Table.Cell>
                <Table.Cell class="text-right tabular-nums">
                  <div class="flex flex-col items-end gap-1">
                    <span>{formatNumber(row.orders)}</span>
                    <DeltaBadge delta={row.deltas?.orders} />
                  </div>
                </Table.Cell>
                <Table.Cell class="text-right tabular-nums">
                  <div class="flex flex-col items-end gap-1">
                    <span>{formatMoney(row.avgBasketSize)}</span>
                    <DeltaBadge delta={row.deltas?.avgBasketSize} />
                  </div>
                </Table.Cell>
                {#if !isWolt}
                  <Table.Cell class="text-right tabular-nums">
                    {formatNumber(row.completedOrders)}
                  </Table.Cell>
                {/if}
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      </div>
    {/if}
  </Card.Content>
</Card.Root>
