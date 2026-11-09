<script lang="ts">
  import OfferValueDialog from "$lib/components/sales/offer-value-dialog.svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import { formatCompactMoney } from "$lib/services/forecasts/forecast-narrative";
  import { formatSalesCount } from "$lib/services/sales-dashboard";
  import {
    OFFER_VERDICT_LABELS,
    OFFER_VERDICT_VARIANT,
    type OfferValue,
  } from "$lib/services/sales-offers";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

  // The /sales/offers dialog, scoped to the clicked channel(s) so its curve and
  // export cover the same orders as the numbers.
  let dialogOpen = $state(false);
  let selected = $state<{
    offer: OfferValue;
    channels: string[];
    idealFcPerc: number | null;
  } | null>(null);

  function openOffer(
    offer: OfferValue | undefined,
    channels: string[],
    idealFcPerc: number | null,
  ) {
    if (!offer) return;
    selected = { offer, channels, idealFcPerc };
    dialogOpen = true;
  }
</script>

<svelte:head>
  <title>Offers by Channel | Delivery Sales | Aggregator Offers Tool</title>
</svelte:head>

{#if data.offers}
  <Card.Root>
    <Card.Header>
      <Card.Title>Offers by channel</Card.Title>
      <Card.Description>
        Each offer valued as on Sales › Offers (offer net incl. its add-on
        basket, food cost, margin vs the brand target), counting only orders on
        that channel. Volume is not lift: many offers run on the same days.
        <Badge variant="outline">Campaign</Badge> = registered aggregator offer whose
        dates overlap the range. Scope = the channel the offer is set up for in the
        offer master data.
      </Card.Description>
    </Card.Header>
    <Card.Content>
      {#await data.offers}
        <div class="space-y-2" aria-busy="true">
          <p class="text-muted-foreground text-sm">
            Valuing offers per channel…
          </p>
          {#each { length: 6 } as _, i (i)}
            <Skeleton class="h-8 w-full" />
          {/each}
        </div>
      {:then result}
        {#if result.idealFcPerc === null}
          <p class="text-muted-foreground mb-3 text-sm">
            This brand has no ideal FC % target yet, so margins have no verdict.
          </p>
        {/if}
        <div class="max-h-[40rem] overflow-auto">
          <Table.Root>
            <Table.Header>
              <Table.Row>
                <Table.Head>Offer</Table.Head>
                <Table.Head>Scope</Table.Head>
                {#each data.picked ?? [] as channel, i (channel)}
                  <Table.Head class="text-right">
                    {channel}
                    <span
                      class="text-muted-foreground block text-xs font-normal"
                    >
                      offers {result.channelNet[i]
                        ? pct(result.matrix.offerNet[i] / result.channelNet[i])
                        : "–"} of net
                    </span>
                  </Table.Head>
                {/each}
                {#if (data.picked ?? []).length > 1}
                  <Table.Head class="text-right">Delivery total</Table.Head>
                {/if}
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {#each result.matrix.rows as row (row.code)}
                <Table.Row>
                  <Table.Cell class="max-w-64">
                    <button
                      type="button"
                      class="block max-w-full truncate text-left font-medium underline-offset-4 hover:underline"
                      title={`${row.name}: details on ${(data.picked ?? []).join(", ")}`}
                      onclick={() =>
                        openOffer(
                          result.scopeOffers.find((o) => o.code === row.code),
                          data.picked ?? [],
                          result.idealFcPerc,
                        )}
                    >
                      {row.name}
                    </button>
                    <div class="text-muted-foreground text-xs">{row.code}</div>
                  </Table.Cell>
                  <Table.Cell class="text-muted-foreground text-xs">
                    {row.scope ?? "–"}
                  </Table.Cell>
                  {#each row.cells as cell, i (data.picked?.[i])}
                    <Table.Cell class="text-right align-top tabular-nums">
                      {#if cell}
                        <button
                          type="button"
                          class="ml-auto block text-right underline-offset-4 hover:underline"
                          title={`${row.name} on ${data.picked?.[i]}`}
                          onclick={() =>
                            openOffer(
                              cell.offer,
                              [data.picked?.[i] ?? ""],
                              result.idealFcPerc,
                            )}
                        >
                          <span class="block"
                            >{formatCompactMoney(cell.offer.offerNet)}</span
                          >
                          <span class="text-muted-foreground block text-xs">
                            {formatSalesCount(cell.offer.orders)} orders
                          </span>
                        </button>
                        <Badge
                          variant={OFFER_VERDICT_VARIANT[cell.offer.verdict]}
                          title={OFFER_VERDICT_LABELS[cell.offer.verdict]}
                        >
                          {cell.offer.marginPct === null
                            ? OFFER_VERDICT_LABELS[cell.offer.verdict]
                            : `${pct(cell.offer.marginPct)} margin`}
                        </Badge>
                        {#each cell.campaigns as campaign (`${campaign.name}|${campaign.startsAt}|${campaign.endsAt}`)}
                          <Badge
                            variant="outline"
                            class="mt-1"
                            title={`${campaign.name}: ${campaign.startsAt} to ${campaign.endsAt}`}
                          >
                            Campaign
                          </Badge>
                        {/each}
                      {:else}
                        <span class="text-muted-foreground">–</span>
                      {/if}
                    </Table.Cell>
                  {/each}
                  {#if row.cells.length > 1}
                    <Table.Cell class="text-right align-top tabular-nums">
                      <div>{formatCompactMoney(row.totalNet)}</div>
                      <div class="text-muted-foreground text-xs">
                        {formatSalesCount(row.totalOrders)} orders
                      </div>
                    </Table.Cell>
                  {/if}
                </Table.Row>
              {:else}
                <Table.Row>
                  <Table.Cell colspan={99} class="text-muted-foreground">
                    No offers sold on these channels in this range.
                  </Table.Cell>
                </Table.Row>
              {/each}
            </Table.Body>
          </Table.Root>
        </div>
      {:catch}
        <p class="text-destructive text-sm">
          The offers could not be loaded. Reload the page to try again.
        </p>
      {/await}
    </Card.Content>
  </Card.Root>
{/if}

{#if selected && data.scope}
  <OfferValueDialog
    bind:open={dialogOpen}
    offer={selected.offer}
    brand={data.scope.filters.brands[0]}
    range={{ from: data.scope.filters.from, to: data.scope.filters.to }}
    channels={selected.channels}
    idealFcPerc={selected.idealFcPerc}
    verdictVariant={OFFER_VERDICT_VARIANT}
  />
{/if}
