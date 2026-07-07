<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import {
    formatKpiDateTime,
    formatNumber,
    formatRating,
    type RatingHistoryPoint,
  } from "$lib/services/aggregator-kpis/aggregator-kpis";
  import StarIcon from "@lucide/svelte/icons/star";

  let {
    title = "Ratings history",
    data,
  }: {
    title?: string;
    data: RatingHistoryPoint[];
  } = $props();
</script>

<Card.Root>
  <Card.Header>
    <Card.Title>{title}</Card.Title>
    <Card.Description>
      Every captured rating snapshot for this store — store rating and total
      number of reviews, newest first.
    </Card.Description>
  </Card.Header>
  <Card.Content>
    {#if data.length === 0}
      <p class="text-muted-foreground text-sm">
        No ratings history for this store yet.
      </p>
    {:else}
      <div class="overflow-x-auto">
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.Head>Captured</Table.Head>
              <Table.Head class="text-right">Rating</Table.Head>
              <Table.Head class="text-right">Total reviews</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each data as point (point.scrapedAt)}
              <Table.Row>
                <Table.Cell class="whitespace-nowrap">
                  {formatKpiDateTime(point.scrapedAt)}
                </Table.Cell>
                <Table.Cell class="text-right">
                  <span
                    class="inline-flex items-center justify-end gap-1 tabular-nums"
                  >
                    {formatRating(point.storeRating)}
                    {#if point.storeRating !== null}
                      <StarIcon
                        class="size-3.5 fill-amber-400 text-amber-400"
                      />
                    {/if}
                  </span>
                </Table.Cell>
                <Table.Cell class="text-right tabular-nums">
                  {formatNumber(point.totalReviews)}
                </Table.Cell>
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      </div>
    {/if}
  </Card.Content>
</Card.Root>
