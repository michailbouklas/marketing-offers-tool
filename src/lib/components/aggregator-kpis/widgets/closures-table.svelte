<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import {
    aggregatorLabel,
    formatDuration,
    formatKpiDateTime,
    formatPct,
    formatPeriodLong,
    type ClosureRow,
    type PeriodKind,
  } from "$lib/services/aggregator-kpis/aggregator-kpis";

  let {
    title = "Closures by store",
    description = "Latest captured availability per store — offline time during advertised open hours and total unreachable time.",
    data,
    linkStores = false,
    period = null,
    hideStore = false,
  }: {
    title?: string;
    description?: string;
    data: ClosureRow[];
    /** When true, link each store name to its closures history page. */
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
        No closures data for the current filters.
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
              <Table.Head class="text-right">Offline in open hours</Table.Head>
              <Table.Head class="text-right">Unreachable</Table.Head>
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
                        href={`/aggregator-kpis/closures/${row.storeId}`}
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
                  {formatPct(row.offlineOpenHoursPct)}
                </Table.Cell>
                <Table.Cell class="text-right tabular-nums">
                  {formatDuration(row.unreachableSeconds)}
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
