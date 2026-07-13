<script lang="ts">
  import OrderDetailsPanel from "$lib/components/aggregator-kpis/widgets/order-details-panel.svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import {
    aggregatorLabel,
    formatKpiDateTime,
    orderLateMinutes,
    type ReviewRow,
  } from "$lib/services/aggregator-kpis/aggregator-kpis";
  import StarIcon from "@lucide/svelte/icons/star";

  let {
    data,
    linkStores = false,
  }: {
    data: ReviewRow[];
    linkStores?: boolean;
  } = $props();

  let reviewDialogOpen = $state(false);
  let selectedReview = $state<ReviewRow | null>(null);

  function openReview(review: ReviewRow) {
    selectedReview = review;
    reviewDialogOpen = true;
  }

  function handleRowKeydown(event: KeyboardEvent, review: ReviewRow) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    openReview(review);
  }

  function stopRowClick(event: MouseEvent) {
    event.stopPropagation();
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
          <Table.Row
            class="hover:bg-muted/50 cursor-pointer"
            role="button"
            tabindex={0}
            onclick={() => openReview(row)}
            onkeydown={(event) => handleRowKeydown(event, row)}
          >
            <Table.Cell class="text-muted-foreground whitespace-nowrap">
              {formatKpiDateTime(row.reviewedAt)}
            </Table.Cell>
            <Table.Cell class="max-w-48 truncate font-medium">
              {#if linkStores}
                <a
                  href={`/aggregator-kpis/reviews/${row.storeId}`}
                  class="hover:text-primary hover:underline"
                  onclick={stopRowClick}
                >
                  {row.storeName ?? `Store #${row.storeId}`}
                </a>
              {:else}
                {row.storeName ?? `Store #${row.storeId}`}
              {/if}
            </Table.Cell>
            <Table.Cell>{aggregatorLabel(row.aggregator)}</Table.Cell>
            <Table.Cell>
              <span class="inline-flex items-center gap-1 tabular-nums">
                {row.rating}
                <StarIcon class="size-3.5 fill-amber-400 text-amber-400" />
              </span>
            </Table.Cell>
            <Table.Cell class="max-w-md">
              {@const lateMinutes = orderLateMinutes(row.orderDetails)}
              <div class="space-y-1">
                {#if lateMinutes !== null}
                  <Badge variant="destructive">{lateMinutes} min late</Badge>
                {/if}
                <span
                  class="text-muted-foreground line-clamp-2 text-sm whitespace-normal"
                >
                  {row.comment || "-"}
                </span>
              </div>
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

      <dl class="grid grid-cols-[9rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
        <dt class="text-muted-foreground">Review id</dt>
        <dd class="font-mono text-xs">{selectedReview.id}</dd>

        <dt class="text-muted-foreground">Store</dt>
        <dd>
          {selectedReview.storeName ?? `Store #${selectedReview.storeId}`}
        </dd>

        <dt class="text-muted-foreground">Store id</dt>
        <dd class="font-mono text-xs">{selectedReview.storeId}</dd>

        <dt class="text-muted-foreground">Platform</dt>
        <dd>
          <Badge variant="outline">
            {aggregatorLabel(selectedReview.aggregator)}
          </Badge>
        </dd>

        <dt class="text-muted-foreground">Rating</dt>
        <dd class="tabular-nums">{selectedReview.rating} / 5</dd>

        <dt class="text-muted-foreground">Review date</dt>
        <dd>{formatKpiDateTime(selectedReview.reviewedAt)}</dd>

        <dt class="text-muted-foreground">Raw date</dt>
        <dd>{selectedReview.reviewedAtRaw ?? "-"}</dd>

        <dt class="text-muted-foreground">External order</dt>
        <dd class="font-mono text-xs break-all">
          {selectedReview.externalOrderId ?? "-"}
        </dd>

        <dt class="text-muted-foreground">Dedupe key</dt>
        <dd class="font-mono text-xs break-all">{selectedReview.dedupeKey}</dd>

        <dt class="text-muted-foreground">First seen</dt>
        <dd>{formatKpiDateTime(selectedReview.firstSeenAt)}</dd>

        <dt class="text-muted-foreground">Last seen</dt>
        <dd>{formatKpiDateTime(selectedReview.lastSeenAt)}</dd>
      </dl>

      <div class="space-y-2">
        <p class="text-sm font-medium">Review</p>
        <p class="text-muted-foreground text-sm leading-6 whitespace-pre-wrap">
          {selectedReview.comment || "No review text."}
        </p>
      </div>

      {#if selectedReview.orderDetails}
        <OrderDetailsPanel
          order={selectedReview.orderDetails}
          orderScrapedAt={selectedReview.orderScrapedAt}
        />
      {:else}
        <p class="text-muted-foreground text-sm">
          Order details unavailable — this review hasn't been enriched yet.
        </p>
      {/if}
    {/if}
  </Dialog.Content>
</Dialog.Root>
