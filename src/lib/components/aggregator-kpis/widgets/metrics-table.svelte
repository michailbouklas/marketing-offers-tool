<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
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
              <Table.Head class="text-right">Completed</Table.Head>
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
                  {formatMoney(row.sales)}
                </Table.Cell>
                <Table.Cell class="text-right tabular-nums">
                  {formatNumber(row.orders)}
                </Table.Cell>
                <Table.Cell class="text-right tabular-nums">
                  {formatMoney(row.avgBasketSize)}
                </Table.Cell>
                <Table.Cell class="text-right tabular-nums">
                  {formatNumber(row.completedOrders)}
                </Table.Cell>
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      </div>
    {/if}
  </Card.Content>
</Card.Root>
