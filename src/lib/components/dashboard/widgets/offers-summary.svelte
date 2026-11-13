<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import type { OffersWidgetData } from "$lib/dashboard/widgets";
  import {
    formatSalesAmount,
    formatSalesCount,
  } from "$lib/services/sales-dashboard";
  import {
    OFFER_VERDICT_LABELS,
    OFFER_VERDICT_VARIANT,
    type OfferVerdict,
  } from "$lib/services/sales-offers";
  import PeriodCaption from "./period-caption.svelte";

  let { data }: { data: OffersWidgetData } = $props();

  const verdicts = $derived(
    (Object.keys(OFFER_VERDICT_LABELS) as OfferVerdict[]).filter(
      (verdict) => data.verdicts[verdict],
    ),
  );
</script>

<PeriodCaption {data} />
{#if data.top.length === 0}
  <p class="text-muted-foreground text-sm">No offers sold in this period.</p>
{:else}
  <div class="mb-3 flex flex-wrap gap-1.5">
    {#each verdicts as verdict (verdict)}
      <Badge variant={OFFER_VERDICT_VARIANT[verdict]}>
        {OFFER_VERDICT_LABELS[verdict]}: {data.verdicts[verdict]}
      </Badge>
    {/each}
  </div>
  <table class="w-full text-sm">
    <thead class="text-muted-foreground text-xs">
      <tr>
        <th class="text-left font-normal">Top offers</th>
        <th class="text-right font-normal">Orders</th>
        <th class="text-right font-normal">Net</th>
      </tr>
    </thead>
    <tbody class="tabular-nums">
      {#each data.top as offer (offer.code)}
        <tr>
          <td class="max-w-0 truncate py-1" title={offer.name}>{offer.name}</td>
          <td class="text-right">{formatSalesCount(offer.orders)}</td>
          <td class="text-right">{formatSalesAmount(offer.offerNet)}</td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}
