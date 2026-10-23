<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { parseRoles, roleLabels } from "$lib/auth/roles";
  import DateRangeFilter from "$lib/components/date-range-filter.svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Collapsible from "$lib/components/ui/collapsible/index.js";
  import { formatDuration } from "$lib/services/page-views/page-views";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const history = $derived(data.history);
  const range = $derived(data.range);
  const rangeLabel = $derived(
    range.selected.from || range.selected.to
      ? `${range.selected.from ?? "Start"} → ${range.to}`
      : "All time",
  );

  const numberFormatter = new Intl.NumberFormat();
  const dayFormatter = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const timeFormatter = $derived(
    new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: range.timeZone,
    }),
  );

  /** `YYYY-MM-DD` is a calendar day, so format it as UTC to avoid shifting. */
  function formatDay(day: string): string {
    return dayFormatter.format(new Date(`${day}T00:00:00Z`));
  }

  function formatTime(iso: string): string {
    return timeFormatter.format(new Date(iso));
  }

  function formatRoles(role: string | null): string {
    const parsed = parseRoles(role);
    return parsed.length > 0
      ? parsed.map((r) => roleLabels[r]).join(", ")
      : "No role";
  }

  function routeLabel(routeId: string): string {
    return routeId || "Unknown page (404)";
  }

  function applyRange(next: { from?: string; to?: string }) {
    const params = new URLSearchParams();
    if (next.from) {
      params.set("from", next.from);
    }
    if (next.to) {
      params.set("to", next.to);
    }
    const query = params.toString();
    goto(`${page.url.pathname}${query ? `?${query}` : ""}`, {
      keepFocus: true,
      noScroll: true,
    });
  }
</script>

<svelte:head>
  <title>{history.user.name} · Visit history | Aggregator Offers Tool</title>
  <meta
    name="description"
    content="Everything one user visited in the tool, grouped by day."
  />
</svelte:head>

<div class="relative isolate min-h-screen overflow-hidden">
  <div class="bg-background absolute inset-0 -z-20"></div>

  <main
    class="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10"
  >
    <section
      class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
    >
      <div class="space-y-2">
        <p
          class="text-sm font-semibold tracking-[0.18em] text-zinc-500 uppercase"
        >
          Visit history
        </p>
        <h1 class="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
          {history.user.name}
        </h1>
        <p class="text-muted-foreground flex flex-wrap items-center gap-2">
          {history.user.email}
          <Badge variant="secondary">{formatRoles(history.user.role)}</Badge>
        </p>
      </div>

      <Button
        href={`/admin/live-monitoring/history${page.url.search}`}
        variant="outline"
      >
        <ArrowLeftIcon class="size-4" />
        All users
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
        <strong class="text-foreground"
          >{numberFormatter.format(history.totals.visits)}</strong
        >
        visits ·
        <strong class="text-foreground"
          >{numberFormatter.format(history.totals.pageViews)}</strong
        >
        page views ·
        <strong class="text-foreground"
          >{formatDuration(history.totals.foregroundMs)}</strong
        >
        on app
      </p>
    </section>

    {#each history.days as day (day.day)}
      <Card.Root class="border-border/70">
        <Card.Header>
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <Card.Title class="text-lg">{formatDay(day.day)}</Card.Title>
            <span class="text-muted-foreground text-sm">
              {day.visits}
              {day.visits === 1 ? "visit" : "visits"} · {day.pageViews} page
              {day.pageViews === 1 ? "view" : "views"} · {formatDuration(
                day.foregroundMs,
              )}
            </span>
          </div>
          {#if !day.hasDetail}
            <Card.Description>
              Exact pages are no longer stored for this day; only per-page
              totals remain.
            </Card.Description>
          {/if}
        </Card.Header>
        <Card.Content class="space-y-2">
          {#each day.routes as route (route.routeId)}
            {@const views = day.viewsByRoute[route.routeId] ?? []}
            <Collapsible.Root class="rounded-lg border">
              <Collapsible.Trigger
                disabled={views.length === 0}
                class="hover:bg-muted/40 group flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors disabled:cursor-default disabled:hover:bg-transparent"
              >
                <span class="min-w-0 truncate font-mono text-xs">
                  {routeLabel(route.routeId)}
                </span>
                <span
                  class="text-muted-foreground flex shrink-0 items-center gap-3 text-xs tabular-nums"
                >
                  <span>{route.views}×</span>
                  <span>{formatDuration(route.foregroundMs)}</span>
                  <span>
                    {formatTime(route.firstSeenAt)}–{formatTime(
                      route.lastSeenAt,
                    )}
                  </span>
                  {#if views.length > 0}
                    <ChevronDownIcon
                      class="size-4 transition-transform group-data-[state=open]:rotate-180"
                    />
                  {/if}
                </span>
              </Collapsible.Trigger>
              {#if views.length > 0}
                <Collapsible.Content class="border-t px-3 py-2">
                  <ul class="divide-border/70 divide-y">
                    {#each views as view (view.id)}
                      <li
                        class="flex items-start justify-between gap-3 py-1.5 text-xs"
                      >
                        <div class="min-w-0">
                          <p class="truncate font-medium">
                            {view.title || view.path}
                          </p>
                          <a
                            href={view.path}
                            class="text-muted-foreground hover:text-foreground block truncate font-mono hover:underline"
                          >
                            {view.path}
                          </a>
                        </div>
                        <span
                          class="text-muted-foreground shrink-0 text-right tabular-nums"
                        >
                          {formatTime(view.startedAt)}–{formatTime(
                            view.lastSeenAt,
                          )}
                          <br />
                          {formatDuration(view.foregroundMs)} in front
                        </span>
                      </li>
                    {/each}
                  </ul>
                </Collapsible.Content>
              {/if}
            </Collapsible.Root>
          {/each}
        </Card.Content>
      </Card.Root>
    {:else}
      <Card.Root class="border-border/70">
        <Card.Content class="text-muted-foreground py-10 text-center text-sm">
          No recorded visits in this range.
        </Card.Content>
      </Card.Root>
    {/each}
  </main>
</div>
