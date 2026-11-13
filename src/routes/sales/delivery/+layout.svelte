<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import ChatWidget from "$lib/components/ai-chat/chat-widget.svelte";
  import DateRangeFilter from "$lib/components/date-range-filter.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as ButtonGroup from "$lib/components/ui/button-group/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import {
    salesDashboardSearch,
    type SalesDashboardFilters,
  } from "$lib/services/sales-dashboard";
  import type { Snippet } from "svelte";
  import type { LayoutData } from "./$types";

  let { data, children }: { data: LayoutData; children: Snippet } = $props();

  const filters = $derived(data.scope?.filters ?? null);
  const base = "/sales/delivery";
  const tabs = [
    { path: base, label: "Overview" },
    { path: `${base}/vs`, label: "Channel VS" },
    { path: `${base}/offers`, label: "Offers" },
  ];
  // Channel VS picks its own channels, so the single-channel filter is hidden there.
  const onVs = $derived(page.url.pathname === `${base}/vs`);
  const tab = $derived(
    page.url.pathname.endsWith("/vs")
      ? "vs"
      : page.url.pathname.endsWith("/offers")
        ? "offers"
        : "overview",
  );

  /** Same tab, new filters; `channel`/`vs` survive unless `reset` (brand switch). */
  function href(
    next: Partial<SalesDashboardFilters>,
    channel: string | null = data.channel,
    reset = false,
  ): string {
    if (!filters) return page.url.pathname;
    const search = new URLSearchParams(
      salesDashboardSearch({ ...filters, ...next }, { allBrands: false }),
    );
    if (channel) search.set("channel", channel);
    const vs = page.url.searchParams.get("vs");
    if (vs && !reset) search.set("vs", vs);
    return `${page.url.pathname}?${search}`;
  }
</script>

<main
  class="mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10"
>
  <section class="space-y-2">
    <h1 class="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
      Delivery sales
    </h1>
    <p class="text-muted-foreground max-w-3xl text-base leading-7">
      Net sales (excl. VAT) and orders on aggregator channels, including app
      orders collected in store. Gross = net before discounts. Own-fleet
      delivery (call centre, website) is not included.
    </p>
  </section>

  {#if !filters}
    <Card.Root>
      <Card.Content class="text-muted-foreground py-8 text-sm">
        You are not assigned to any brand yet, so there are no sales to show.
        Ask an admin to assign your brands.
      </Card.Content>
    </Card.Root>
  {:else}
    <div class="space-y-2">
      <span class="text-sm font-medium" id="brand-label">Brand</span>
      <ButtonGroup.Root aria-labelledby="brand-label" class="flex-wrap">
        {#each data.scope?.brands ?? [] as item (item.alias)}
          <Button
            href={href({ brands: [item.alias] }, null, true)}
            variant={item.alias === filters.brands[0] ? "default" : "outline"}
            aria-current={item.alias === filters.brands[0] ? "page" : undefined}
          >
            {item.name}
          </Button>
        {/each}
      </ButtonGroup.Root>
    </div>

    <div class="flex flex-wrap items-end gap-3">
      {#if !onVs}
        <div class="space-y-2">
          <span class="text-sm font-medium" id="channel-label">Channel</span>
          <ButtonGroup.Root aria-labelledby="channel-label" class="flex-wrap">
            <Button
              href={href({}, null)}
              variant={data.channel === null ? "default" : "outline"}
              aria-current={data.channel === null ? "page" : undefined}
            >
              All delivery
            </Button>
            {#each data.channels as item (item.channel)}
              <Button
                href={href({}, item.channel)}
                variant={item.channel === data.channel ? "default" : "outline"}
                aria-current={item.channel === data.channel
                  ? "page"
                  : undefined}
              >
                {item.channel}
              </Button>
            {/each}
          </ButtonGroup.Root>
        </div>
      {/if}

      <div class="space-y-2">
        <span class="text-sm font-medium">Date range</span>
        <DateRangeFilter
          from={filters.from}
          to={filters.to}
          onApply={(range) =>
            goto(href({ from: range.from ?? "", to: range.to ?? "" }), {
              keepFocus: true,
              noScroll: true,
            })}
        />
      </div>
    </div>

    <nav aria-label="Delivery views" class="border-b">
      <div class="-mb-px flex gap-1">
        {#each tabs as tab (tab.path)}
          {@const active = page.url.pathname === tab.path}
          <a
            href={`${tab.path}${page.url.search}`}
            aria-current={active ? "page" : undefined}
            class={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${active ? "border-primary text-foreground" : "text-muted-foreground hover:text-foreground border-transparent"}`}
          >
            {tab.label}
          </a>
        {/each}
      </div>
    </nav>

    {#if data.channels.length === 0}
      <Card.Root>
        <Card.Content class="text-muted-foreground py-8 text-sm">
          No delivery sales for this brand between {filters.from} and {filters.to}.
        </Card.Content>
      </Card.Root>
    {:else}
      {@render children()}
    {/if}

    <ChatWidget
      agentId="sales-delivery-agent"
      title="Delivery Assistant"
      greeting="Hi! Ask me how each delivery platform performs, compare Wolt vs Bolt, or which offers work per channel."
      placeholder="e.g. How did Wolt compare with Bolt this month?"
      context={{
        brands: filters.brands,
        from: filters.from,
        to: filters.to,
        channel: data.channel,
        vs: page.url.searchParams.get("vs")?.split(",") ?? null,
        tab,
      }}
    />
  {/if}
</main>
