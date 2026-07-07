<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import {
    aggregatorLabel,
    formatKpiDateTime,
    formatNumber,
    formatRating,
    type RatingRow,
  } from "$lib/services/aggregator-kpis/aggregator-kpis";
  import StarIcon from "@lucide/svelte/icons/star";

  let {
    title = "Ratings by store",
    data,
    linkStores = false,
  }: {
    title?: string;
    data: RatingRow[];
    /** When true, link each store name to its ratings history page. */
    linkStores?: boolean;
  } = $props();
</script>

<Card.Root>
  <Card.Header>
    <Card.Title>{title}</Card.Title>
    <Card.Description>
      Latest captured store rating and total number of reviews per store.
    </Card.Description>
  </Card.Header>
  <Card.Content>
    {#if data.length === 0}
      <p class="text-muted-foreground text-sm">
        No ratings data for the current filters.
      </p>
    {:else}
      <div class="overflow-x-auto">
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.Head>Store</Table.Head>
              <Table.Head>Platform</Table.Head>
              <Table.Head class="text-right">Rating</Table.Head>
              <Table.Head class="text-right">Total reviews</Table.Head>
              <Table.Head class="text-right">Captured</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each data as row (row.storeId)}
              <Table.Row>
                <Table.Cell class="font-medium">
                  {#if linkStores}
                    <a
                      href={`/aggregator-kpis/ratings/${row.storeId}`}
                      class="hover:text-primary hover:underline"
                    >
                      {row.storeName ?? `Store #${row.storeId}`}
                    </a>
                  {:else}
                    {row.storeName ?? `Store #${row.storeId}`}
                  {/if}
                </Table.Cell>
                <Table.Cell>{aggregatorLabel(row.aggregator)}</Table.Cell>
                <Table.Cell class="text-right">
                  <span
                    class="inline-flex items-center justify-end gap-1 tabular-nums"
                  >
                    {formatRating(row.storeRating)}
                    {#if row.storeRating !== null}
                      <StarIcon
                        class="size-3.5 fill-amber-400 text-amber-400"
                      />
                    {/if}
                  </span>
                </Table.Cell>
                <Table.Cell class="text-right tabular-nums">
                  {formatNumber(row.totalReviews)}
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
