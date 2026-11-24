<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import {
    DEAD_GAP_DAYS,
    LIVE_GAP_DAYS,
    type LiveGaps,
  } from "$lib/services/offers-data-quality";

  let {
    open = $bindable(false),
    gaps,
  }: { open?: boolean; gaps: Promise<LiveGaps> } = $props();

  const euro = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
    <Dialog.Header>
      <Dialog.Title>Selling now, not priced</Dialog.Title>
      <Dialog.Description>
        Offers in the queue that sold in the last {LIVE_GAP_DAYS} days, across all
        your brands, biggest earner first. Net per day is lifetime net sales divided
        by the days the offer sold. Sales are as of last night.
      </Dialog.Description>
    </Dialog.Header>

    {#await gaps}
      <div class="space-y-3" aria-busy="true">
        <Skeleton class="h-10 w-full" />
        <Skeleton class="h-64 w-full" />
      </div>
    {:then result}
      <p class="text-sm">
        <span class="font-semibold tabular-nums">{result.live.length}</span>
        of {result.total} offers in the queue are selling now.
        <span class="font-semibold tabular-nums">{result.dead}</span>
        have not sold in {Math.round(DEAD_GAP_DAYS / 30)} months or never sold; those
        can be removed from the list.
      </p>
      {#if result.live.length > 0}
        <div class="overflow-x-auto rounded-xl border">
          <Table.Root>
            <Table.Header>
              <Table.Row>
                <Table.Head>Item</Table.Head>
                <Table.Head>Brand</Table.Head>
                <Table.Head class="text-right">Net per day</Table.Head>
                <Table.Head class="text-right">Lifetime net</Table.Head>
                <Table.Head>Last sale</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {#each result.live as gap (gap.dq_id)}
                <Table.Row>
                  <Table.Cell>
                    <a
                      href="/offers-data-quality/{gap.dq_id}"
                      class="font-medium underline-offset-4 hover:underline"
                    >
                      {gap.item_name}
                    </a>
                    <p class="text-muted-foreground font-mono text-xs">
                      {gap.trde_item}
                    </p>
                  </Table.Cell>
                  <Table.Cell>{gap.brand}</Table.Cell>
                  <Table.Cell class="text-right tabular-nums">
                    {euro.format(gap.netPerDay)}
                  </Table.Cell>
                  <Table.Cell class="text-right tabular-nums">
                    {euro.format(gap.lifetimeNet)}
                  </Table.Cell>
                  <Table.Cell>{gap.lastSale}</Table.Cell>
                </Table.Row>
              {/each}
            </Table.Body>
          </Table.Root>
        </div>
      {/if}
    {:catch}
      <p class="text-destructive py-10 text-center text-sm" role="alert">
        The list could not be loaded. Reload the page to try again.
      </p>
    {/await}
  </Dialog.Content>
</Dialog.Root>
