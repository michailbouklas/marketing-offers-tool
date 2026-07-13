<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import {
    aggregatorLabel,
    formatKpiDateTime,
    formatMoney,
    formatNumber,
    formatPct,
    formatPeriodLong,
    type PeriodKind,
    type RejectionRow,
  } from "$lib/services/aggregator-kpis/aggregator-kpis";

  let {
    title = "Order rejections by store",
    description = "Latest captured cancellation rate, lost sales, and orders rejected for unknown reasons per store.",
    data,
    linkStores = false,
    period = null,
    hideStore = false,
  }: {
    title?: string;
    description?: string;
    data: RejectionRow[];
    /** When true, link each store name to its order-rejections history page. */
    linkStores?: boolean;
    /** When set, render a Period column (Foody period view) instead of Platform/Captured. */
    period?: PeriodKind | null;
    /** When true, omit the store column (per-store detail page). */
    hideStore?: boolean;
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
        No order-rejection data for the current filters.
      </p>
    {:else}
      <div class="overflow-x-auto">
        <Table.Root>
          <Table.Header>
            <Table.Row>
              {#if !hideStore}
                <Table.Head>Store</Table.Head>
              {/if}
              {#if period}
                <Table.Head>Period</Table.Head>
              {:else}
                <Table.Head>Platform</Table.Head>
              {/if}
              <Table.Head class="text-right">Cancellations</Table.Head>
              <Table.Head class="text-right">Lost sales</Table.Head>
              <Table.Head class="text-right">Reason unknown</Table.Head>
              {#if !period}
                <Table.Head class="text-right">Captured</Table.Head>
              {/if}
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each data as row (`${row.storeId}:${row.periodStart ?? ""}:${row.periodEnd ?? ""}`)}
              <Table.Row>
                {#if !hideStore}
                  <Table.Cell class="font-medium">
                    {#if linkStores}
                      <a
                        href={`/aggregator-kpis/order-rejections/${row.storeId}`}
                        class="hover:text-primary hover:underline"
                      >
                        {row.storeName ?? `Store #${row.storeId}`}
                      </a>
                    {:else}
                      {row.storeName ?? `Store #${row.storeId}`}
                    {/if}
                  </Table.Cell>
                {/if}
                {#if period}
                  <Table.Cell class="whitespace-nowrap">
                    {formatPeriodLong(
                      row.periodStart ?? "",
                      row.periodEnd ?? "",
                      period,
                    )}
                  </Table.Cell>
                {:else}
                  <Table.Cell>{aggregatorLabel(row.aggregator)}</Table.Cell>
                {/if}
                <Table.Cell class="text-right tabular-nums">
                  {formatPct(row.cancellationsPct)}
                </Table.Cell>
                <Table.Cell class="text-right tabular-nums">
                  {formatMoney(row.lostSales)}
                </Table.Cell>
                <Table.Cell class="text-right tabular-nums">
                  {formatNumber(row.reasonUnknownCount)}
                </Table.Cell>
                {#if !period}
                  <Table.Cell
                    class="text-muted-foreground text-right whitespace-nowrap"
                  >
                    {formatKpiDateTime(row.scrapedAt)}
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
