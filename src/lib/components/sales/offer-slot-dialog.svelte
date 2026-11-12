<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import {
    formatSalesAmount,
    formatSalesCount,
  } from "$lib/services/sales-dashboard";
  import type {
    OfferDateRange,
    OfferSlot,
    OfferSlotSale,
  } from "$lib/services/sales-offers";

  let {
    open = $bindable(false),
    slot,
    title,
    brand,
    range,
    channels,
  }: {
    open: boolean;
    slot: OfferSlot | null;
    title: string;
    brand: string;
    range: OfferDateRange;
    /** Only orders on these channels; omitted = all. */
    channels?: string[];
  } = $props();

  let sales = $state<OfferSlotSale[] | null>(null);
  let failed = $state(false);

  // Same stale guard as the offer value dialog: a newer cell wins.
  $effect(() => {
    if (!open || !slot) return;
    let stale = false;
    sales = null;
    failed = false;
    fetch("/sales/offers/slot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ brand, range, channels, slot }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(await response.text());
        const rows: OfferSlotSale[] = await response.json();
        if (!stale) sales = rows;
      })
      .catch(() => {
        if (!stale) failed = true;
      });
    return () => {
      stale = true;
    };
  });

  const total = $derived(
    (sales ?? []).reduce(
      (sum, row) => ({ units: sum.units + row.units, net: sum.net + row.net }),
      { units: 0, net: 0 },
    ),
  );
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
    <Dialog.Header>
      <Dialog.Title>{title}</Dialog.Title>
      <Dialog.Description>
        Offers sold, totals for this cell between {range.from} and {range.to}{channels
          ? ` on ${channels.join(", ")}`
          : ""}. Net excl. VAT.
      </Dialog.Description>
    </Dialog.Header>
    {#if failed}
      <p class="text-destructive text-sm">
        Could not load the offers for this cell. Try again in a moment.
      </p>
    {:else if !sales}
      <div class="space-y-2" aria-busy="true">
        {#each { length: 5 } as _, index (index)}
          <Skeleton class="h-8 w-full" />
        {/each}
      </div>
    {:else if sales.length === 0}
      <p class="text-muted-foreground text-sm">No offers sold here.</p>
    {:else}
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head>Offer</Table.Head>
            <Table.Head class="text-right">Offers sold</Table.Head>
            <Table.Head class="text-right">Orders</Table.Head>
            <Table.Head class="text-right">Net sales</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each sales as row (row.code)}
            <Table.Row>
              <Table.Cell class="max-w-72">
                <div class="truncate font-medium" title={row.name}>
                  {row.name}
                </div>
                <div class="text-muted-foreground text-xs">{row.code}</div>
              </Table.Cell>
              <Table.Cell class="text-right tabular-nums">
                {formatSalesCount(Math.round(row.units))}
              </Table.Cell>
              <Table.Cell class="text-right tabular-nums">
                {formatSalesCount(row.orders)}
              </Table.Cell>
              <Table.Cell class="text-right tabular-nums">
                {formatSalesAmount(row.net)}
              </Table.Cell>
            </Table.Row>
          {/each}
          <Table.Row class="font-medium">
            <Table.Cell>Total</Table.Cell>
            <Table.Cell class="text-right tabular-nums">
              {formatSalesCount(Math.round(total.units))}
            </Table.Cell>
            <Table.Cell></Table.Cell>
            <Table.Cell class="text-right tabular-nums">
              {formatSalesAmount(total.net)}
            </Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table.Root>
    {/if}
  </Dialog.Content>
</Dialog.Root>
