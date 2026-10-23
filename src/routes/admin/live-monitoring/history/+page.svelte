<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import DateRangeFilter from "$lib/components/date-range-filter.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import { formatDuration } from "$lib/services/page-views/page-views";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const visitors = $derived(data.visitors);
  const range = $derived(data.range);
  const rangeLabel = $derived(
    range.selected.from || range.selected.to
      ? `${range.selected.from ?? "Start"} → ${range.to}`
      : "All time",
  );

  const totals = $derived(
    visitors.reduce(
      (sum, visitor) => ({
        visits: sum.visits + visitor.visits,
        pageViews: sum.pageViews + visitor.pageViews,
      }),
      { visits: 0, pageViews: 0 },
    ),
  );

  const numberFormatter = new Intl.NumberFormat();
  const dateTimeFormatter = $derived(
    new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: range.timeZone,
    }),
  );

  function rangeQuery(next: { from?: string; to?: string }): string {
    const params = new URLSearchParams();
    if (next.from) {
      params.set("from", next.from);
    }
    if (next.to) {
      params.set("to", next.to);
    }
    const query = params.toString();
    return query ? `?${query}` : "";
  }

  function applyRange(next: { from?: string; to?: string }) {
    goto(`${page.url.pathname}${rangeQuery(next)}`, {
      keepFocus: true,
      noScroll: true,
    });
  }
</script>

<svelte:head>
  <title>Visit history | Aggregator Offers Tool</title>
  <meta
    name="description"
    content="Who used the tool in a date range: last visit, visits and page views per user."
  />
</svelte:head>

<div class="relative isolate min-h-screen overflow-hidden">
  <div class="bg-background absolute inset-0 -z-20"></div>

  <main
    class="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10"
  >
    <section
      class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
    >
      <div class="space-y-2">
        <p
          class="text-sm font-semibold tracking-[0.18em] text-zinc-500 uppercase"
        >
          Live monitoring
        </p>
        <h1 class="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
          Visit history
        </h1>
        <p class="text-muted-foreground max-w-2xl text-base leading-7">
          Everyone who used the tool in the selected range. A visit ends after
          30 minutes without activity; time counts only while the tab was in
          front.
        </p>
      </div>

      <Button href="/admin/live-monitoring" variant="outline">
        <ArrowLeftIcon class="size-4" />
        Back to live
      </Button>
    </section>

    <section class="flex flex-wrap items-center justify-between gap-3">
      <DateRangeFilter
        from={range.selected.from}
        to={range.selected.to}
        onApply={applyRange}
      />
      <p class="text-muted-foreground text-sm">
        {rangeLabel} ·
        <strong class="text-foreground">{visitors.length}</strong>
        {visitors.length === 1 ? "user" : "users"} ·
        <strong class="text-foreground"
          >{numberFormatter.format(totals.visits)}</strong
        >
        visits ·
        <strong class="text-foreground"
          >{numberFormatter.format(totals.pageViews)}</strong
        >
        page views
      </p>
    </section>

    <Card.Root class="border-border/70">
      <Card.Content>
        {#if visitors.length === 0}
          <p class="text-muted-foreground py-10 text-center text-sm">
            No recorded visits in this range.
          </p>
        {:else}
          <Table.Root>
            <Table.Header>
              <Table.Row>
                <Table.Head>User</Table.Head>
                <Table.Head>Last visit</Table.Head>
                <Table.Head class="text-right">Visits</Table.Head>
                <Table.Head class="text-right">Page views</Table.Head>
                <Table.Head class="text-right">Time on app</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {#each visitors as visitor (visitor.userId)}
                <Table.Row>
                  <Table.Cell>
                    <a
                      href={`/admin/live-monitoring/history/${visitor.userId}${page.url.search}`}
                      class="group flex flex-col"
                    >
                      <span
                        class="font-medium underline-offset-4 group-hover:underline"
                      >
                        {visitor.name}
                      </span>
                      <span class="text-muted-foreground text-xs">
                        {visitor.email}
                      </span>
                    </a>
                  </Table.Cell>
                  <Table.Cell>
                    {dateTimeFormatter.format(new Date(visitor.lastVisitAt))}
                  </Table.Cell>
                  <Table.Cell class="text-right tabular-nums">
                    {numberFormatter.format(visitor.visits)}
                  </Table.Cell>
                  <Table.Cell class="text-right tabular-nums">
                    {numberFormatter.format(visitor.pageViews)}
                  </Table.Cell>
                  <Table.Cell class="text-right tabular-nums">
                    {formatDuration(visitor.foregroundMs)}
                  </Table.Cell>
                </Table.Row>
              {/each}
            </Table.Body>
          </Table.Root>
        {/if}
      </Card.Content>
    </Card.Root>
  </main>
</div>
