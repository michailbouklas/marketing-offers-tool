<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import {
    aggregatorLabel,
    formatKpiDateTime,
    type ReviewRow,
  } from "$lib/services/aggregator-kpis/aggregator-kpis";
  import StarIcon from "@lucide/svelte/icons/star";

  let {
    data,
  }: {
    data: ReviewRow[];
  } = $props();

  let reviewDialogOpen = $state(false);
  let selectedReview = $state<ReviewRow | null>(null);

  function openReview(review: ReviewRow) {
    selectedReview = review;
    reviewDialogOpen = true;
  }
</script>

<div class="overflow-x-auto">
  <Table.Root>
    <Table.Header>
      <Table.Row>
        <Table.Head>Date</Table.Head>
        <Table.Head>Store</Table.Head>
        <Table.Head>Platform</Table.Head>
        <Table.Head>Rating</Table.Head>
        <Table.Head>Review</Table.Head>
      </Table.Row>
    </Table.Header>
    <Table.Body>
      {#if data.length === 0}
        <Table.Row>
          <Table.Cell
            colspan={5}
            class="text-muted-foreground py-8 text-center"
          >
            No reviews match the current filters.
          </Table.Cell>
        </Table.Row>
      {:else}
        {#each data as row (row.id)}
          <Table.Row>
            <Table.Cell class="text-muted-foreground whitespace-nowrap">
              {formatKpiDateTime(row.reviewedAt)}
            </Table.Cell>
            <Table.Cell class="max-w-48 truncate font-medium">
              {row.storeName ?? `Store #${row.storeId}`}
            </Table.Cell>
            <Table.Cell>{aggregatorLabel(row.aggregator)}</Table.Cell>
            <Table.Cell>
              <span class="inline-flex items-center gap-1 tabular-nums">
                {row.rating}
                <StarIcon class="size-3.5 fill-amber-400 text-amber-400" />
              </span>
            </Table.Cell>
            <Table.Cell class="max-w-md">
              <button
                type="button"
                class="hover:text-foreground block w-full cursor-pointer text-left"
                onclick={() => openReview(row)}
                title="Read full review"
              >
                <span
                  class="text-muted-foreground line-clamp-2 text-sm whitespace-normal"
                >
                  {row.comment || "—"}
                </span>
              </button>
            </Table.Cell>
          </Table.Row>
        {/each}
      {/if}
    </Table.Body>
  </Table.Root>
</div>

<Dialog.Root bind:open={reviewDialogOpen}>
  <Dialog.Content class="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
    {#if selectedReview}
      <Dialog.Header>
        <Dialog.Title class="flex flex-wrap items-center gap-2">
          {selectedReview.storeName ?? `Store #${selectedReview.storeId}`}
          <span class="inline-flex items-center gap-1 text-base tabular-nums">
            {selectedReview.rating}
            <StarIcon class="size-4 fill-amber-400 text-amber-400" />
          </span>
        </Dialog.Title>
        <Dialog.Description>
          {formatKpiDateTime(selectedReview.reviewedAt)}
        </Dialog.Description>
      </Dialog.Header>

      <dl class="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
        <dt class="text-muted-foreground">Store</dt>
        <dd>
          {selectedReview.storeName ?? `Store #${selectedReview.storeId}`}
        </dd>

        <dt class="text-muted-foreground">Platform</dt>
        <dd>
          <Badge variant="outline">
            {aggregatorLabel(selectedReview.aggregator)}
          </Badge>
        </dd>

        <dt class="text-muted-foreground">Rating</dt>
        <dd class="tabular-nums">{selectedReview.rating} / 5</dd>

        <dt class="text-muted-foreground">Date</dt>
        <dd>{formatKpiDateTime(selectedReview.reviewedAt)}</dd>
      </dl>

      <div class="space-y-2">
        <p class="text-sm font-medium">Review</p>
        <p class="text-muted-foreground text-sm leading-6 whitespace-pre-wrap">
          {selectedReview.comment || "No review text."}
        </p>
      </div>
    {/if}
  </Dialog.Content>
</Dialog.Root>
