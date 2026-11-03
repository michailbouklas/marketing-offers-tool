<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import {
    formatSalesAmount,
    formatSalesCount,
  } from "$lib/services/sales-dashboard";
  import {
    OFFER_VERDICT_LABELS,
    VAT_DIVISOR,
    offerReason,
    unitFoodCost,
    type OfferValue,
    type OfferVerdict,
  } from "$lib/services/sales-offers";

  let {
    open = $bindable(false),
    offer,
    idealFcPerc,
    verdictVariant,
  }: {
    open: boolean;
    offer: OfferValue | null;
    idealFcPerc: number | null;
    verdictVariant: Record<
      OfferVerdict,
      "default" | "secondary" | "destructive" | "outline"
    >;
  } = $props();

  const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

  type Step = { label: string; how: string; amount: number; total?: boolean };

  const steps = $derived.by((): Step[] => {
    if (!offer) return [];
    const perUnit = offer.units > 0 ? offer.offerNet / offer.units : 0;
    const perOrder = offer.orders > 0 ? offer.addonNet / offer.orders : 0;
    const list: Step[] = [
      {
        label: "Offer net sales",
        how: `excl. VAT, ${formatSalesAmount(perUnit)} per unit on average`,
        amount: offer.offerNet,
      },
    ];
    const unitCost = unitFoodCost(offer);
    if (offer.foodCost !== null && unitCost !== null) {
      list.push(
        {
          label: "− Food cost",
          how: offer.fcEur
            ? `${formatSalesCount(Math.round(offer.units))} units × ${formatSalesAmount(unitCost)} (catalogue FC €)`
            : `${formatSalesCount(Math.round(offer.units))} units × ${formatSalesAmount(unitCost)} (FC ${pct(offer.fcPerc ?? 0)} of ${formatSalesAmount(offer.sellingPrice ?? 0)} ÷ ${VAT_DIVISOR.toFixed(4)} VAT)`,
          amount: -offer.foodCost,
        },
        {
          label: "= Offer margin",
          how:
            offer.offerNet > 0
              ? `${pct(1 - offer.foodCost / offer.offerNet)} of offer sales`
              : "no offer sales",
          amount: offer.offerNet - offer.foodCost,
          total: true,
        },
      );
    }
    list.push({
      label: "Add-on sales",
      how: `other items in the same orders, ${formatSalesAmount(perOrder)} per order`,
      amount: offer.addonNet,
    });
    if (offer.contribution !== null && idealFcPerc !== null) {
      list.push(
        {
          label: "+ Add-on margin",
          how: `add-on sales × ${pct(1 - idealFcPerc)} (costed at the brand's ${pct(idealFcPerc)} ideal FC)`,
          amount: offer.addonNet * (1 - idealFcPerc),
        },
        {
          label: "= Contribution",
          how:
            offer.marginPct === null
              ? "no sales"
              : `${pct(offer.marginPct)} of all sales, target ${pct(1 - idealFcPerc)}`,
          amount: offer.contribution,
          total: true,
        },
      );
    }
    return list;
  });

  // Food cost uses today's catalogue price; flag offers whose real price moved.
  const priceNote = $derived.by(() => {
    if (!offer?.sellingPrice || offer.units <= 0) return null;
    const catalogue = offer.sellingPrice / VAT_DIVISOR;
    const actual = offer.offerNet / offer.units;
    return Math.abs(actual - catalogue) / catalogue > 0.1
      ? `Customers paid ${formatSalesAmount(actual)} per unit on average (excl. VAT), but today's catalogue price is ${formatSalesAmount(catalogue)}. The price changed during the offer's life, and food cost is based on today's figures, so treat the margin as approximate.`
      : null;
  });
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
    {#if offer}
      <Dialog.Header>
        <Dialog.Title>{offer.name}</Dialog.Title>
        <Dialog.Description>
          {offer.code}{offer.channel
            ? ` · ${offer.channel}`
            : ""}{offer.category ? ` · ${offer.category}` : ""} · sold {offer.firstSale}
          → {offer.lastSale} ({formatSalesCount(offer.daysOnSale)} days), {formatSalesCount(
            Math.round(offer.units),
          )} units in {formatSalesCount(offer.orders)} orders
        </Dialog.Description>
      </Dialog.Header>

      <div class="space-y-2">
        <Badge variant={verdictVariant[offer.verdict]}>
          {OFFER_VERDICT_LABELS[offer.verdict]}
        </Badge>
        <p class="text-sm leading-6">{offerReason(offer, idealFcPerc)}</p>
      </div>

      <Table.Root>
        <Table.Body>
          {#each steps as step (step.label)}
            <Table.Row class={step.total ? "font-medium" : ""}>
              <Table.Cell>{step.label}</Table.Cell>
              <Table.Cell
                class="text-muted-foreground text-xs whitespace-normal"
              >
                {step.how}
              </Table.Cell>
              <Table.Cell class="text-right tabular-nums">
                {formatSalesAmount(step.amount)}
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>

      {#if priceNote}
        <p class="text-muted-foreground text-sm">{priceNote}</p>
      {/if}
      <p class="text-muted-foreground text-xs leading-5">
        Not counted: full-price sales the offer may have replaced, and
        aggregator (Wolt, Bolt, Foody) commission. Both would lower the real
        result.
      </p>
    {/if}
  </Dialog.Content>
</Dialog.Root>
