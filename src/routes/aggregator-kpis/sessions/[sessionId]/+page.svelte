<script lang="ts">
  import SessionOutcomeBar from "$lib/components/aggregator-kpis/widgets/session-outcome-bar.svelte";
  import SessionDiagnosticsSummary from "$lib/components/aggregator-kpis/widgets/session-diagnostics-summary.svelte";
  import SectionTopReasons from "$lib/components/aggregator-kpis/widgets/section-top-reasons.svelte";
  import StoreOutcomesTable from "$lib/components/aggregator-kpis/widgets/store-outcomes-table.svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { buttonVariants } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import {
    aggregatorLabel,
    formatDuration,
    formatKpiDateTime,
    scrapeRunStatusLabel,
    scrapeRunStatusVariant,
  } from "$lib/services/aggregator-kpis/aggregator-kpis";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const session = $derived(data.detail.session);
  const stores = $derived(data.detail.stores);
  const counts = $derived(data.detail.outcomeCounts);
  const diagnostics = $derived(data.detail.diagnostics);

  // The outcome bar reflects the per-store outcomes actually resolved for this
  // run (derived from section statuses), which is what the table below lists.
  const hasStores = $derived(stores.length > 0);
</script>

<svelte:head>
  <title>Session {session.sessionId} | Sessions | Aggregator KPIs</title>
  <meta
    name="description"
    content="Per-store scrape outcomes for a single scrape session, including each store's derived outcome and per-section status."
  />
</svelte:head>

<div class="relative isolate min-h-screen overflow-hidden">
  <div class="bg-background absolute inset-0 -z-20"></div>
  <div
    class="absolute inset-x-0 top-0 -z-10 h-[24rem] bg-[radial-gradient(circle_at_top_left,_color-mix(in_oklab,var(--color-chart-3)_18%,transparent),transparent_34%),radial-gradient(circle_at_88%_14%,_color-mix(in_oklab,var(--color-chart-1)_18%,transparent),transparent_26%)]"
  ></div>

  <main
    class="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10"
  >
    <div
      class="flex flex-wrap items-center gap-2 text-xs tracking-[0.18em] text-zinc-500 uppercase"
    >
      <a href="/aggregator-kpis" class="hover:text-foreground transition-colors"
        >Aggregator KPIs</a
      >
      <ChevronRightIcon class="size-3" />
      <a
        href="/aggregator-kpis/sessions"
        class="hover:text-foreground transition-colors">Sessions</a
      >
      <ChevronRightIcon class="size-3" />
      <span>Detail</span>
    </div>

    <div class="flex flex-wrap items-start justify-between gap-4">
      <section class="space-y-2">
        <h1
          class="font-mono text-3xl font-semibold tracking-[-0.03em] sm:text-4xl"
        >
          {session.sessionId}
        </h1>
        <p class="text-muted-foreground max-w-3xl text-base leading-7">
          Per-store scrape outcomes for this session on {aggregatorLabel(
            session.aggregator,
          )}. Each store's outcome is derived from its per-section statuses.
        </p>
      </section>

      <a
        href="/aggregator-kpis/sessions"
        class={buttonVariants({ variant: "outline", size: "sm" })}
      >
        <ArrowLeftIcon class="size-4" />
        Back to sessions
      </a>
    </div>

    <Card.Root>
      <Card.Header>
        <Card.Title>Session summary</Card.Title>
      </Card.Header>
      <Card.Content class="flex flex-col gap-5">
        <dl
          class="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3 lg:grid-cols-5"
        >
          <div class="space-y-1">
            <dt class="text-muted-foreground text-xs tracking-wide uppercase">
              Platform
            </dt>
            <dd>{aggregatorLabel(session.aggregator)}</dd>
          </div>
          <div class="space-y-1">
            <dt class="text-muted-foreground text-xs tracking-wide uppercase">
              Status
            </dt>
            <dd>
              <Badge
                variant="outline"
                class={scrapeRunStatusVariant(session.status)}
              >
                {scrapeRunStatusLabel(session.status)}
              </Badge>
            </dd>
          </div>
          <div class="space-y-1">
            <dt class="text-muted-foreground text-xs tracking-wide uppercase">
              Started
            </dt>
            <dd class="whitespace-nowrap">
              {formatKpiDateTime(session.startedAt)}
            </dd>
          </div>
          <div class="space-y-1">
            <dt class="text-muted-foreground text-xs tracking-wide uppercase">
              Duration
            </dt>
            <dd class="tabular-nums">
              {#if session.endedAt === null}
                <span class="text-muted-foreground">ongoing</span>
              {:else}
                {formatDuration(session.durationSeconds)}
              {/if}
            </dd>
          </div>
          <div class="space-y-1">
            <dt class="text-muted-foreground text-xs tracking-wide uppercase">
              Shard
            </dt>
            <dd>{session.shard ?? "—"}</dd>
          </div>
        </dl>

        <div class="max-w-md">
          <SessionOutcomeBar
            ok={counts.ok}
            partial={counts.partial}
            failed={counts.failed}
            skipped={counts.skipped}
            total={session.totalStores}
          />
        </div>
      </Card.Content>
    </Card.Root>

    <SessionDiagnosticsSummary {diagnostics} />

    <SectionTopReasons {diagnostics} />

    <StoreOutcomesTable data={stores} />

    {#if !hasStores}
      <p class="text-muted-foreground text-sm">
        This session has no child scrape results yet (its run id is still
        unset), so there are no per-store outcomes to show.
      </p>
    {/if}
  </main>
</div>
