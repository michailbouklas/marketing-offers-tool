<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import {
    formatSalesAmount,
    formatSalesCount,
  } from "$lib/services/sales-dashboard";
  import {
    VALUE_BUCKETS,
    type ExploreValueBreakdown,
    type OfferFilter,
    type ValueBucket,
  } from "$lib/services/sales-explore";
  import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
  import { toast } from "svelte-sonner";

  let {
    open = $bindable(false),
    endpoint,
    search,
    filter,
    offers,
    scope,
  }: {
    open: boolean;
    endpoint: string;
    /** URL query string (date window + brands). */
    search: string;
    /** The grid's current column filters. */
    filter: unknown;
    offers: OfferFilter | null;
    /** Human-readable description of what is being measured. */
    scope: string;
  } = $props();

  const labels: Record<ValueBucket, string> = {
    offer: "Offers",
    combo: "Combos",
    other: "Other items",
  };
  const colors: Record<ValueBucket, string> = {
    offer: "var(--chart-5)",
    combo: "var(--chart-3)",
    other: "var(--chart-1)",
  };
  const discountFill =
    "repeating-linear-gradient(45deg, var(--chart-2) 0 4px, transparent 4px 8px)";

  let data = $state<ExploreValueBreakdown | null>(null);
  let loading = $state(false);

  // Fresh numbers on every open: the filters may have changed since.
  let wasOpen = false;
  $effect(() => {
    if (open && !wasOpen) void load();
    wasOpen = open;
  });

  async function load() {
    data = null;
    loading = true;
    try {
      const response = await fetch(`${endpoint}/breakdown${search}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filter, offers }),
      });
      if (!response.ok) throw new Error(String(response.status));
      data = (await response.json()) as ExploreValueBreakdown;
    } catch {
      open = false;
      toast.error("Could not calculate the value breakdown.");
    } finally {
      loading = false;
    }
  }

  const pct = (part: number, whole: number) =>
    whole ? `${((part / whole) * 100).toFixed(1)}%` : "—";

  // The bar is what customers would have paid without discounts.
  const barTotal = $derived(
    data ? data.lineNet + Math.max(data.discount, 0) : 0,
  );
  const segments = $derived(
    data
      ? [
          ...VALUE_BUCKETS.map((bucket) => ({
            label: labels[bucket],
            value: data!.buckets[bucket].net,
            fill: colors[bucket],
          })),
          { label: "Discounts", value: data.discount, fill: discountFill },
        ].filter((segment) => segment.value > 0)
      : [],
  );
  const remainder = $derived(data ? data.orderNet - data.lineNet : 0);
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
    <Dialog.Header>
      <Dialog.Title>Value breakdown</Dialog.Title>
      <Dialog.Description>{scope}</Dialog.Description>
    </Dialog.Header>

    {#if loading}
      <div class="flex justify-center py-10">
        <LoaderCircleIcon class="text-muted-foreground size-6 animate-spin" />
      </div>
    {:else if data}
      <div class="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        {#each [{ label: "Order net", value: data.orderNet, note: `${formatSalesCount(data.orders)} orders` }, { label: "From offers", value: data.buckets.offer.net, note: `${pct(data.buckets.offer.net, data.orderNet)} of net` }, { label: "From combos", value: data.buckets.combo.net, note: `${pct(data.buckets.combo.net, data.orderNet)} of net` }, { label: "Discounts given", value: data.discount, note: `${pct(data.discount, data.orderNet + data.discount)} of pre-discount · ${formatSalesCount(data.discountOrders)} orders` }] as tile (tile.label)}
          <div class="bg-muted/50 rounded-lg px-3 py-2">
            <p class="text-muted-foreground text-xs">{tile.label}</p>
            <p class="text-base font-semibold">
              {formatSalesAmount(tile.value)}
            </p>
            <p class="text-muted-foreground text-xs">{tile.note}</p>
          </div>
        {/each}
      </div>

      {#if barTotal > 0}
        <div class="space-y-2">
          <div
            class="flex h-6 w-full overflow-hidden rounded-md border"
            role="img"
            aria-label={segments
              .map((s) => `${s.label} ${pct(s.value, barTotal)}`)
              .join(", ")}
          >
            {#each segments as segment (segment.label)}
              <div
                class="h-full"
                style:width={`${(segment.value / barTotal) * 100}%`}
                style:background={segment.fill}
                title={`${segment.label}: ${formatSalesAmount(segment.value)}`}
              ></div>
            {/each}
          </div>
          <ul class="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {#each segments as segment (segment.label)}
              <li class="flex items-center gap-1.5">
                <span
                  class="size-3 rounded-sm border"
                  style:background={segment.fill}
                ></span>
                {segment.label}
                <span class="text-muted-foreground">
                  {formatSalesAmount(segment.value)} · {pct(
                    segment.value,
                    barTotal,
                  )}
                </span>
              </li>
            {/each}
          </ul>
        </div>
      {/if}

      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head></Table.Head>
            <Table.Head class="text-right">Orders containing</Table.Head>
            <Table.Head class="text-right">Net</Table.Head>
            <Table.Head class="text-right">% of net</Table.Head>
            <Table.Head class="text-right">Discount given</Table.Head>
            <Table.Head class="text-right">Avg net / order</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each VALUE_BUCKETS as bucket (bucket)}
            {@const row = data.buckets[bucket]}
            <Table.Row>
              <Table.Cell class="font-medium">{labels[bucket]}</Table.Cell>
              <Table.Cell class="text-right"
                >{formatSalesCount(row.orders)}</Table.Cell
              >
              <Table.Cell class="text-right"
                >{formatSalesAmount(row.net)}</Table.Cell
              >
              <Table.Cell class="text-right"
                >{pct(row.net, data.orderNet)}</Table.Cell
              >
              <Table.Cell class="text-right"
                >{formatSalesAmount(row.discount)}</Table.Cell
              >
              <Table.Cell class="text-right">
                {row.orders ? formatSalesAmount(row.net / row.orders) : "—"}
              </Table.Cell>
            </Table.Row>
          {/each}
          <Table.Row class="font-semibold">
            <Table.Cell>Total</Table.Cell>
            <Table.Cell class="text-right"
              >{formatSalesCount(data.orders)}</Table.Cell
            >
            <Table.Cell class="text-right"
              >{formatSalesAmount(data.orderNet)}</Table.Cell
            >
            <Table.Cell class="text-right">100%</Table.Cell>
            <Table.Cell class="text-right"
              >{formatSalesAmount(data.discount)}</Table.Cell
            >
            <Table.Cell class="text-right">
              {data.orders
                ? formatSalesAmount(data.orderNet / data.orders)
                : "—"}
            </Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table.Root>

      <div class="text-muted-foreground space-y-1 text-xs">
        <p>
          Amounts are net of VAT. Offers and Combos include the items inside
          each bundle (an item in both counts as an offer). Discounts are the
          order discounts, on top of the net, split across groups by the
          discounted items' value. Delivery charges are left out.
        </p>
        {#if Math.abs(remainder) >= 0.01}
          <p>
            Item lines differ from order totals by {formatSalesAmount(
              remainder,
            )} ({pct(Math.abs(remainder), data.orderNet)}), so the groups do not
            add up exactly.
          </p>
        {/if}
      </div>
    {/if}
  </Dialog.Content>
</Dialog.Root>
