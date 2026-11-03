<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import { page } from "$app/state";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as ButtonGroup from "$lib/components/ui/button-group/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import OfferValueDialog from "$lib/components/sales/offer-value-dialog.svelte";
  import {
    formatSalesAmount,
    formatSalesCount,
  } from "$lib/services/sales-dashboard";
  import {
    OFFER_VERDICT_LABELS,
    type OfferValue,
    type OfferVerdict,
  } from "$lib/services/sales-offers";
  import ArrowUpDownIcon from "@lucide/svelte/icons/arrow-up-down";
  import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
  import { toast } from "svelte-sonner";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  type SortKey =
    | "name"
    | "lastSale"
    | "daysOnSale"
    | "units"
    | "offerNet"
    | "foodCost"
    | "addonPerOrder"
    | "contribution"
    | "marginPct";

  let refreshing = $state(false);
  let selected = $state<OfferValue | null>(null);
  let dialogOpen = $state(false);

  const updatedAt = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  /** Recompute this brand from ClickHouse (seconds), then reload the cache. */
  async function refresh(alias: string) {
    refreshing = true;
    try {
      const response = await fetch("/sales/offers/refresh", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ brand: alias }),
      });
      if (!response.ok) throw new Error(await response.text());
      const result: { status: "ran" | "skipped" } = await response.json();
      if (result.status === "skipped") {
        toast.info("A refresh for this brand is already running.");
      }
      await invalidateAll();
    } catch {
      toast.error("Could not refresh the offers. Try again in a moment.");
    } finally {
      refreshing = false;
    }
  }

  let sort = $state<{ key: SortKey; desc: boolean }>({
    key: "contribution",
    desc: true,
  });

  const allBrands = $derived(data.scope?.brands ?? []);
  const brand = $derived(
    allBrands.find((item) => item.alias === data.scope?.filters.brands[0]) ??
      null,
  );

  const VERDICT_VARIANT: Record<
    OfferVerdict,
    "default" | "secondary" | "destructive" | "outline"
  > = {
    positive: "default",
    below_target: "secondary",
    loss: "destructive",
    no_cost: "outline",
    no_target: "outline",
  };
  const VERDICTS = Object.keys(OFFER_VERDICT_LABELS) as OfferVerdict[];

  const pct = new Intl.NumberFormat("en-GB", {
    style: "percent",
    maximumFractionDigits: 1,
  });
  const money = (value: number | null) =>
    value === null ? "–" : formatSalesAmount(value);
  const addonPerOrder = (offer: OfferValue) =>
    offer.orders > 0 ? offer.addonNet / offer.orders : 0;

  function sortValue(offer: OfferValue, key: SortKey): string | number {
    if (key === "addonPerOrder") return addonPerOrder(offer);
    // Unknown values sink to the bottom either way.
    return offer[key] ?? (sort.desc ? -Infinity : Infinity);
  }

  function sorted(offers: OfferValue[]): OfferValue[] {
    const sign = sort.desc ? -1 : 1;
    return [...offers].sort((a, b) => {
      const x = sortValue(a, sort.key);
      const y = sortValue(b, sort.key);
      return x < y ? -sign : x > y ? sign : 0;
    });
  }

  function toggleSort(key: SortKey) {
    sort =
      sort.key === key
        ? { key, desc: !sort.desc }
        : { key, desc: key !== "name" };
  }

  const countBy = (offers: OfferValue[], verdict: OfferVerdict) =>
    offers.filter((offer) => offer.verdict === verdict).length;

  const COLUMNS: { key: SortKey; label: string; numeric: boolean }[] = [
    { key: "name", label: "Offer", numeric: false },
    { key: "lastSale", label: "On sale", numeric: false },
    { key: "daysOnSale", label: "Days on sale", numeric: true },
    { key: "units", label: "Units", numeric: true },
    { key: "offerNet", label: "Offer net", numeric: true },
    { key: "foodCost", label: "Food cost", numeric: true },
    { key: "addonPerOrder", label: "Add-on / order", numeric: true },
    { key: "contribution", label: "Contribution", numeric: true },
    { key: "marginPct", label: "Margin", numeric: true },
  ];
</script>

<svelte:head>
  <title>Offers value</title>
</svelte:head>

<main
  class="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10"
>
  <section class="space-y-2">
    <h1 class="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
      Offers value
    </h1>
    <p class="text-muted-foreground max-w-3xl text-base leading-7">
      Every offer the brand has sold, measured over its whole life. Contribution
      is the offer's net sales (excl. VAT) minus its food cost, plus the margin
      on everything else bought in the same orders (costed at the brand's ideal
      FC %). An offer is positive when that margin meets the brand target.
    </p>
  </section>

  {#if !data.scope || !brand}
    <Card.Root>
      <Card.Content class="text-muted-foreground py-8 text-sm">
        You are not assigned to any brand yet, so there are no offers to show.
        Ask an admin to assign your brands.
      </Card.Content>
    </Card.Root>
  {:else}
    <div class="space-y-2">
      <span class="text-sm font-medium" id="brand-label">Brand</span>
      <ButtonGroup.Root aria-labelledby="brand-label" class="flex-wrap">
        {#each allBrands as item (item.alias)}
          <Button
            href={`${page.url.pathname}?brands=${encodeURIComponent(item.alias)}`}
            variant={item.alias === brand.alias ? "default" : "outline"}
            aria-current={item.alias === brand.alias ? "page" : undefined}
          >
            {item.name}
          </Button>
        {/each}
      </ButtonGroup.Root>
    </div>

    {#await data.offers}
      <Card.Root aria-busy="true">
        <Card.Content class="space-y-3 py-6">
          <p class="text-muted-foreground text-sm">
            First visit for {brand.name}: adding up its full sales history.
            Later visits load instantly from the daily cache.
          </p>
          {#each { length: 8 } as _, index (index)}
            <Skeleton class="h-8 w-full" />
          {/each}
        </Card.Content>
      </Card.Root>
    {:then cached}
      {@const offers = cached?.offers ?? []}
      <div class="flex flex-wrap items-center gap-3 text-sm">
        <span class="text-muted-foreground">
          {cached
            ? `Updated ${updatedAt.format(cached.computedAt)} · refreshed daily`
            : "Another refresh is computing this brand; reload in a minute."}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={refreshing}
          onclick={() => refresh(brand.alias)}
        >
          {#if refreshing}
            <LoaderCircleIcon class="animate-spin" aria-hidden="true" />
            Refreshing…
          {:else}
            <RefreshCwIcon aria-hidden="true" />
            Refresh
          {/if}
        </Button>
      </div>
      {#if offers.length === 0}
        <Card.Root>
          <Card.Content class="text-muted-foreground py-8 text-sm">
            No offers found for {brand.name}.
          </Card.Content>
        </Card.Root>
      {:else}
        <div class="flex flex-wrap gap-2 text-sm">
          {#each VERDICTS as verdict (verdict)}
            {@const count = countBy(offers, verdict)}
            {#if count > 0}
              <Badge variant={VERDICT_VARIANT[verdict]}>
                {OFFER_VERDICT_LABELS[verdict]}: {count}
              </Badge>
            {/if}
          {/each}
        </div>
        {#if countBy(offers, "no_target") > 0}
          <p class="text-muted-foreground text-sm">
            {brand.name} has no ideal FC % target yet, so no verdict can be given.
            An admin can set it on the brand's admin page.
          </p>
        {/if}
        {#if countBy(offers, "no_cost") > 0}
          <p class="text-muted-foreground text-sm">
            Offers marked "No cost data" have no food cost in the offers
            catalogue. Fill them in from <a
              class="underline"
              href="/offers-data-quality">Offers data quality</a
            >.
          </p>
        {/if}

        <Card.Root>
          <Card.Content class="p-0">
            <Table.Root>
              <Table.Header>
                <Table.Row>
                  {#each COLUMNS as column (column.key)}
                    <Table.Head
                      class={column.numeric ? "text-right" : ""}
                      aria-sort={sort.key === column.key
                        ? sort.desc
                          ? "descending"
                          : "ascending"
                        : "none"}
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        class="-mx-2"
                        onclick={() => toggleSort(column.key)}
                      >
                        {column.label}
                        <ArrowUpDownIcon aria-hidden="true" />
                      </Button>
                    </Table.Head>
                  {/each}
                  <Table.Head>Verdict</Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {#each sorted(offers) as offer (offer.code)}
                  <Table.Row>
                    <Table.Cell class="max-w-72">
                      <button
                        type="button"
                        class="block max-w-full truncate text-left font-medium underline-offset-4 hover:underline"
                        title="Why {OFFER_VERDICT_LABELS[
                          offer.verdict
                        ].toLowerCase()}? {offer.name}"
                        onclick={() => {
                          selected = offer;
                          dialogOpen = true;
                        }}
                      >
                        {offer.name}
                      </button>
                      <div class="text-muted-foreground text-xs">
                        {offer.code}{offer.channel ? ` · ${offer.channel}` : ""}
                      </div>
                    </Table.Cell>
                    <Table.Cell class="text-xs whitespace-nowrap">
                      {offer.firstSale} → {offer.lastSale}
                    </Table.Cell>
                    <Table.Cell class="text-right tabular-nums">
                      {formatSalesCount(offer.daysOnSale)}
                    </Table.Cell>
                    <Table.Cell class="text-right tabular-nums">
                      {formatSalesCount(Math.round(offer.units))}
                    </Table.Cell>
                    <Table.Cell class="text-right tabular-nums">
                      {money(offer.offerNet)}
                    </Table.Cell>
                    <Table.Cell class="text-right tabular-nums">
                      {money(offer.foodCost)}
                    </Table.Cell>
                    <Table.Cell class="text-right tabular-nums">
                      {money(addonPerOrder(offer))}
                    </Table.Cell>
                    <Table.Cell class="text-right font-medium tabular-nums">
                      {money(offer.contribution)}
                    </Table.Cell>
                    <Table.Cell class="text-right tabular-nums">
                      {offer.marginPct === null
                        ? "–"
                        : pct.format(offer.marginPct)}
                    </Table.Cell>
                    <Table.Cell>
                      <Badge variant={VERDICT_VARIANT[offer.verdict]}>
                        {OFFER_VERDICT_LABELS[offer.verdict]}
                      </Badge>
                    </Table.Cell>
                  </Table.Row>
                {/each}
              </Table.Body>
            </Table.Root>
          </Card.Content>
        </Card.Root>
      {/if}
      <OfferValueDialog
        bind:open={dialogOpen}
        offer={selected}
        idealFcPerc={cached?.idealFcPerc ?? null}
        verdictVariant={VERDICT_VARIANT}
      />
    {:catch}
      <Card.Root>
        <Card.Content class="text-destructive py-8 text-sm">
          Could not load the offers for {brand.name}. Try again in a moment.
        </Card.Content>
      </Card.Root>
    {/await}
  {/if}
</main>
