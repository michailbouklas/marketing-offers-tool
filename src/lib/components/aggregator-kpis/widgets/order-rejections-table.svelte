<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import {
    aggregatorLabel,
    formatKpiDateTime,
    formatMoney,
    formatNumber,
    formatPct,
    type RejectionRow,
  } from "$lib/services/aggregator-kpis/aggregator-kpis";

  let {
    title = "Order rejections by store",
    data,
    linkStores = false,
  }: {
    title?: string;
    data: RejectionRow[];
    /** When true, link each store name to its order-rejections history page. */
    linkStores?: boolean;
  } = $props();
</script>

<Card.Root>
  <Card.Header>
    <Card.Title>{title}</Card.Title>
    <Card.Description>
      Latest captured cancellation rate, lost sales, and orders rejected for
      unknown reasons per store.
    </Card.Description>
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
              <Table.Head>Store</Table.Head>
              <Table.Head>Platform</Table.Head>
              <Table.Head class="text-right">Cancellations</Table.Head>
              <Table.Head class="text-right">Lost sales</Table.Head>
              <Table.Head class="text-right">Reason unknown</Table.Head>
              <Table.Head class="text-right">Captured</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each data as row (row.storeId)}
              <Table.Row>
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
                <Table.Cell>{aggregatorLabel(row.aggregator)}</Table.Cell>
                <Table.Cell class="text-right tabular-nums">
                  {formatPct(row.cancellationsPct)}
                </Table.Cell>
                <Table.Cell class="text-right tabular-nums">
                  {formatMoney(row.lostSales)}
                </Table.Cell>
                <Table.Cell class="text-right tabular-nums">
                  {formatNumber(row.reasonUnknownCount)}
                </Table.Cell>
                <Table.Cell
                  class="text-muted-foreground text-right whitespace-nowrap"
                >
                  {formatKpiDateTime(row.scrapedAt)}
                </Table.Cell>
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      </div>
    {/if}
  </Card.Content>
</Card.Root>
