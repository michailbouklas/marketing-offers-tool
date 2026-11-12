<script lang="ts">
  import { goto, invalidateAll } from "$app/navigation";
  import { page } from "$app/state";
  import { Badge, badgeVariants } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import DateRangeFilter from "$lib/components/date-range-filter.svelte";
  import * as AlertDialog from "$lib/components/ui/alert-dialog/index.js";
  import * as ButtonGroup from "$lib/components/ui/button-group/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import OfferCompareDialog from "$lib/components/sales/offer-compare-dialog.svelte";
  import OfferValueDialog from "$lib/components/sales/offer-value-dialog.svelte";
  import OfferCalendar from "$lib/components/sales/offer-calendar.svelte";
  import MultiSelectFilter from "$lib/components/sales/multi-select-filter.svelte";
  import {
    formatSalesAmount,
    formatSalesCount,
  } from "$lib/services/sales-dashboard";
  import {
    OFFER_VERDICT_LABELS,
    OFFER_VERDICT_VARIANT as VERDICT_VARIANT,
    type OfferValue,
    type OfferVerdict,
  } from "$lib/services/sales-offers";
  import SearchIcon from "@lucide/svelte/icons/search";
  import ArrowUpDownIcon from "@lucide/svelte/icons/arrow-up-down";
  import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
  import DownloadIcon from "@lucide/svelte/icons/download";
  import { cn } from "$lib/utils.js";
  import { toast } from "svelte-sonner";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  type SortKey =
    | "name"
    | "lastSale"
    | "daysOnSale"
    | "units"
    | "qtyPerOrder"
    | "offerNet"
    | "discountGiven"
    | "foodCost"
    | "addonPerOrder"
    | "contribution"
    | "marginPct";

  let refreshing = $state(false);
  let exporting = $state(false);

  /** Server rebuilds the .xlsx from the URL's brand + range (same as the sales dashboard export). */
  async function exportExcel() {
    exporting = true;
    try {
      const response = await fetch(
        `${page.url.pathname}/export${page.url.search}`,
      );
      if (!response.ok) throw new Error(`Export failed (${response.status})`);
      const { downloadUrl } = (await response.json()) as {
        downloadUrl: string;
      };
      window.location.assign(downloadUrl);
    } catch {
      toast.error("The Excel export could not be generated. Try again.");
    } finally {
      exporting = false;
    }
  }
  let selected = $state<OfferValue | null>(null);
  let dialogOpen = $state(false);
  let verdictFilter = $state<OfferVerdict | null>(null); // ignored when its verdict has no rows (e.g. after switching brand)
  // Codes of ticked offers; only those in the current brand's list count.
  let compareCodes = $state<string[]>([]);
  let comparePair = $state<[OfferValue, OfferValue] | null>(null);
  let compareOpen = $state(false);
  let tooManyOpen = $state(false);
  let search = $state("");

  /** Same page and filters on the table or the calendar tab. */
  function tabHref(tab: "table" | "calendar") {
    const params = new URLSearchParams(page.url.searchParams);
    if (tab === "calendar") params.set("tab", "calendar");
    else params.delete("tab");
    return `${page.url.pathname}?${params}`;
  }

  /** Same page with another brand, range and/or channel; omitted = all time / all channels. */
  function offersHref(
    alias: string,
    range: { from?: string; to?: string },
    channels: string[] = [],
    locations: number[] = [],
  ) {
    const params = new URLSearchParams({ brands: alias });
    if (range.from && range.to) {
      params.set("from", range.from);
      params.set("to", range.to);
    }
    if (channels.length > 0) params.set("channels", channels.join(","));
    if (locations.length > 0) params.set("locations", locations.join(","));
    // Table / Calendar tab and the calendar's view toggles survive filter changes.
    for (const key of ["tab", "by", "view"]) {
      const value = page.url.searchParams.get(key);
      if (value) params.set(key, value);
    }
    return `${page.url.pathname}?${params}`;
  }

  const matchesSearch = (offer: OfferValue, query: string) =>
    offer.name.toLowerCase().includes(query) ||
    offer.code.toLowerCase().includes(query);

  function toggleCompare(code: string, checked: boolean) {
    compareCodes = checked
      ? [...compareCodes, code]
      : compareCodes.filter((item) => item !== code);
  }

  function openCompare(picked: OfferValue[]) {
    if (picked.length > 2) {
      tooManyOpen = true;
      return;
    }
    comparePair = [picked[0], picked[1]];
    compareOpen = true;
  }

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

  const VERDICTS = Object.keys(OFFER_VERDICT_LABELS) as OfferVerdict[];

  const pct = new Intl.NumberFormat("en-GB", {
    style: "percent",
    maximumFractionDigits: 1,
  });
  const money = (value: number | null) =>
    value === null ? "–" : formatSalesAmount(value);
  const addonPerOrder = (offer: OfferValue) =>
    offer.orders > 0 ? offer.addonNet / offer.orders : 0;
  /** Offer units per order that contains the offer. */
  const qtyPerOrder = (offer: OfferValue) =>
    offer.orders > 0 ? offer.units / offer.orders : null;
  const qty = new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  function sortValue(offer: OfferValue, key: SortKey): string | number {
    if (key === "addonPerOrder") return addonPerOrder(offer);
    if (key === "qtyPerOrder")
      return qtyPerOrder(offer) ?? (sort.desc ? -Infinity : Infinity);
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
    { key: "qtyPerOrder", label: "Qty / txn", numeric: true },
    { key: "offerNet", label: "Offer net", numeric: true },
    { key: "discountGiven", label: "Discount given", numeric: true },
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
      Every offer the brand has sold, measured over its whole life or over the
      dates you pick. Contribution is the offer's net sales (excl. VAT) minus
      its food cost, plus the margin on everything else bought in the same
      orders (costed at the brand's ideal FC %). An offer is positive when that
      margin meets the brand target. Discount given is the catalogue list price
      minus the offer price, excl. VAT, for every unit sold.
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
    {@const range = data.range ?? null}
    {@const channels = data.scope.filters.channels}
    {@const scopedChannels = channels.length > 0 ? channels : undefined}
    {@const locations = data.locations ?? []}
    {@const scopedLocations = locations.length > 0 ? locations : undefined}
    {@const locationOptions = (data.locationOptions ?? []).map((item) => ({
      value: String(item.id),
      label: item.name,
    }))}
    {@const atLocations = scopedLocations
      ? ` at ${locations.length === 1 ? (locationOptions.find((item) => item.value === String(locations[0]))?.label ?? "1 location") : `${locations.length} locations`}`
      : ""}
    <div class="flex flex-wrap items-end gap-6">
      <div class="space-y-2">
        <span class="text-sm font-medium" id="brand-label">Brand</span>
        <ButtonGroup.Root aria-labelledby="brand-label" class="flex-wrap">
          {#each allBrands as item (item.alias)}
            <Button
              href={offersHref(item.alias, range ?? {})}
              variant={item.alias === brand.alias ? "default" : "outline"}
              aria-current={item.alias === brand.alias ? "page" : undefined}
            >
              {item.name}
            </Button>
          {/each}
        </ButtonGroup.Root>
      </div>

      <div class="space-y-2">
        <span class="text-sm font-medium">Date range</span>
        <DateRangeFilter
          from={range?.from}
          to={range?.to}
          onApply={(next) =>
            goto(offersHref(brand.alias, next, channels, locations), {
              keepFocus: true,
              noScroll: true,
            })}
        />
      </div>

      <MultiSelectFilter
        label="Channel"
        options={(data.channels ?? []).map((value) => ({
          value,
          label: value,
        }))}
        noun="channels"
        selected={channels}
        onApply={(next) =>
          goto(offersHref(brand.alias, range ?? {}, next, locations), {
            keepFocus: true,
            noScroll: true,
          })}
      />

      <MultiSelectFilter
        label="Location"
        options={locationOptions}
        noun="locations"
        selected={locations.map(String)}
        onApply={(next) =>
          goto(
            offersHref(brand.alias, range ?? {}, channels, next.map(Number)),
            {
              keepFocus: true,
              noScroll: true,
            },
          )}
      />

      <div class="space-y-2">
        <span class="text-sm font-medium" id="view-label">View</span>
        <ButtonGroup.Root aria-labelledby="view-label">
          <Button
            href={tabHref("table")}
            variant={data.calendar ? "outline" : "default"}
            aria-current={data.calendar ? undefined : "page"}
          >
            Table
          </Button>
          <Button
            href={tabHref("calendar")}
            variant={data.calendar ? "default" : "outline"}
            aria-current={data.calendar ? "page" : undefined}
          >
            Calendar
          </Button>
        </ButtonGroup.Root>
      </div>
    </div>

    {#if data.calendar && data.calendarRange}
      {#await data.calendar}
        <Card.Root aria-busy="true">
          <Card.Content class="space-y-3 py-6">
            <p class="text-muted-foreground text-sm">
              Adding up {brand.name}'s offer sales from {data.calendarRange
                .from} to {data.calendarRange.to}.
            </p>
            <Skeleton class="h-64 w-full" />
          </Card.Content>
        </Card.Root>
      {:then calendar}
        <OfferCalendar
          {calendar}
          brand={brand.alias}
          range={data.calendarRange}
          channels={scopedChannels}
          locations={scopedLocations}
          allTime={!range}
        />
      {:catch}
        <Card.Root>
          <Card.Content class="text-destructive py-8 text-sm">
            Could not load the offers calendar for {brand.name}. Try again in a
            moment.
          </Card.Content>
        </Card.Root>
      {/await}
    {:else}
      {#await data.offers}
        <Card.Root aria-busy="true">
          <Card.Content class="space-y-3 py-6">
            <p class="text-muted-foreground text-sm">
              {range
                ? `Adding up ${brand.name}'s sales from ${range.from} to ${range.to}.`
                : scopedChannels || scopedLocations
                  ? `Adding up ${brand.name}'s full sales history${scopedChannels ? ` on ${channels.join(", ")}` : ""}${atLocations}.`
                  : `First visit for ${brand.name}: adding up its full sales history. Later visits load instantly from the daily cache.`}
            </p>
            {#each { length: 8 } as _, index (index)}
              <Skeleton class="h-8 w-full" />
            {/each}
          </Card.Content>
        </Card.Root>
      {:then cached}
        {@const offers = cached?.offers ?? []}
        {@const picked = offers.filter((offer) =>
          compareCodes.includes(offer.code),
        )}
        <div class="flex flex-wrap items-center gap-3 text-sm">
          {#if range || scopedChannels || scopedLocations}
            <span class="text-muted-foreground">
              {range
                ? `Sales from ${range.from} to ${range.to}`
                : "All time"}{scopedChannels
                ? ` on ${channels.join(", ")}`
                : ""}{atLocations}, computed live
            </span>
          {:else}
            <span class="text-muted-foreground">
              {cached
                ? `All time · updated ${updatedAt.format(cached.computedAt)} · refreshed daily`
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
          {/if}
          <Button
            size="sm"
            disabled={picked.length < 2}
            title={picked.length < 2
              ? "Tick two offers in the table to compare them"
              : undefined}
            onclick={() => openCompare(picked)}
          >
            Offer VS{picked.length > 0 ? ` (${picked.length})` : ""}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={exporting || offers.length === 0}
            title="All offers of this brand, dates and channel, ignoring the filter and search below"
            onclick={exportExcel}
          >
            {#if exporting}
              <LoaderCircleIcon class="animate-spin" aria-hidden="true" />
            {:else}
              <DownloadIcon aria-hidden="true" />
            {/if}
            Export to Excel
          </Button>
        </div>
        {#if offers.length === 0}
          <Card.Root>
            <Card.Content class="text-muted-foreground py-8 text-sm">
              No offers found for {brand.name}{range
                ? " in these dates"
                : ""}{scopedChannels
                ? ` on ${channels.join(", ")}`
                : ""}{atLocations}.
            </Card.Content>
          </Card.Root>
        {:else}
          {@const activeFilter =
            verdictFilter && countBy(offers, verdictFilter) > 0
              ? verdictFilter
              : null}
          {@const query = search.trim().toLowerCase()}
          {@const visibleOffers = offers.filter(
            (offer) =>
              (!activeFilter || offer.verdict === activeFilter) &&
              (!query || matchesSearch(offer, query)),
          )}
          <div class="relative max-w-sm">
            <SearchIcon
              class="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
              aria-hidden="true"
            />
            <Input
              type="search"
              bind:value={search}
              placeholder="Search offers by name or code"
              aria-label="Search offers by name or code"
              class="pl-8"
            />
          </div>
          <div class="flex flex-wrap gap-2 text-sm">
            {#each VERDICTS as verdict (verdict)}
              {@const count = countBy(offers, verdict)}
              {#if count > 0}
                <button
                  type="button"
                  aria-pressed={activeFilter === verdict}
                  title={activeFilter === verdict
                    ? "Show all offers"
                    : `Show only ${OFFER_VERDICT_LABELS[verdict].toLowerCase()}`}
                  class={cn(
                    badgeVariants({ variant: VERDICT_VARIANT[verdict] }),
                    "cursor-pointer hover:opacity-80",
                    activeFilter && activeFilter !== verdict && "opacity-40",
                    activeFilter === verdict &&
                      "ring-ring ring-offset-background ring-2 ring-offset-1",
                  )}
                  onclick={() =>
                    (verdictFilter = activeFilter === verdict ? null : verdict)}
                >
                  {OFFER_VERDICT_LABELS[verdict]}: {count}
                </button>
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
                    <Table.Head class="w-10">
                      <span class="sr-only">Compare</span>
                    </Table.Head>
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
                  {#each sorted(visibleOffers) as offer (offer.code)}
                    <Table.Row>
                      <Table.Cell>
                        <Checkbox
                          checked={compareCodes.includes(offer.code)}
                          onCheckedChange={(checked) =>
                            toggleCompare(offer.code, checked)}
                          aria-label="Compare {offer.name}"
                        />
                      </Table.Cell>
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
                          {offer.code}{offer.channel
                            ? ` · ${offer.channel}`
                            : ""}
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
                      <Table.Cell
                        class="text-right tabular-nums"
                        title="Units ÷ orders containing the offer"
                      >
                        {@const perOrder = qtyPerOrder(offer)}
                        {perOrder === null ? "–" : qty.format(perOrder)}
                      </Table.Cell>
                      <Table.Cell class="text-right tabular-nums">
                        {money(offer.offerNet)}
                      </Table.Cell>
                      <Table.Cell
                        class="text-right tabular-nums"
                        title="List price minus offer price (catalogue), excl. VAT, × units"
                      >
                        {money(offer.discountGiven)}
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
                  {:else}
                    <Table.Row>
                      <Table.Cell
                        colspan={COLUMNS.length + 2}
                        class="text-muted-foreground py-6 text-center"
                      >
                        No offers match "{search.trim()}".
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
          brand={brand.alias}
          {range}
          channels={scopedChannels}
          locations={scopedLocations}
          idealFcPerc={cached?.idealFcPerc ?? null}
          verdictVariant={VERDICT_VARIANT}
        />
        <OfferCompareDialog
          bind:open={compareOpen}
          offers={comparePair}
          brand={brand.alias}
          {range}
          channels={scopedChannels}
          locations={scopedLocations}
          verdictVariant={VERDICT_VARIANT}
        />
        <AlertDialog.Root bind:open={tooManyOpen}>
          <AlertDialog.Content>
            <AlertDialog.Header>
              <AlertDialog.Title>Pick two offers</AlertDialog.Title>
              <AlertDialog.Description>
                Only 2 offers can be compared at a time. You have {picked.length}
                ticked; untick {picked.length - 2} to continue.
              </AlertDialog.Description>
            </AlertDialog.Header>
            <AlertDialog.Footer>
              <AlertDialog.Action onclick={() => (tooManyOpen = false)}>
                OK
              </AlertDialog.Action>
            </AlertDialog.Footer>
          </AlertDialog.Content>
        </AlertDialog.Root>
      {:catch}
        <Card.Root>
          <Card.Content class="text-destructive py-8 text-sm">
            Could not load the offers for {brand.name}. Try again in a moment.
          </Card.Content>
        </Card.Root>
      {/await}
    {/if}
  {/if}
</main>
