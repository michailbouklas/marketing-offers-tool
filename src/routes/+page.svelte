<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import OfferStatusWidget from "$lib/components/home/offer-status-widget.svelte";
  import MetricLinkCard from "$lib/components/home/metric-link-card.svelte";
  import UsageSummaryWidget from "$lib/components/home/usage-summary-widget.svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const widgetCards = $derived(
    data.offers
      ? [
          {
            title: "Active offers",
            eyebrow: "Live now",
            description:
              "Offers that are currently running and still inside their active date window.",
            countLabel: "currently in market",
            emptyMessage:
              "No live offers right now. New launches will appear here first.",
            footerLabel: "Prioritize the campaigns ending soonest.",
            tone: "active" as const,
            widget: data.offers.activeOffers,
          },
          {
            title: "About to expire",
            eyebrow: "2-day watchlist",
            description:
              "Offers scheduled to end exactly two days from today so the team can react early.",
            countLabel: "ending in 2 days",
            emptyMessage: "Nothing hits the two-day expiry window yet.",
            footerLabel: "Great spot for renewals, swaps, or quick comms.",
            tone: "warning" as const,
            widget: data.offers.expiringSoon,
          },
          {
            title: "Recently expired",
            eyebrow: "Last 48 hours",
            description:
              "Offers whose end date passed during the last two days and may need follow-up.",
            countLabel: "just wrapped",
            emptyMessage:
              "No recent expirations in the last two days. The board is clear.",
            footerLabel:
              "Useful for performance checks and post-campaign wrap-up.",
            tone: "expired" as const,
            widget: data.offers.recentlyExpired,
          },
        ]
      : [],
  );

  const hasAnyWidget = $derived(
    data.access.canEditOffers ||
      data.access.canApprove ||
      data.access.canManageUsers ||
      data.access.canViewUsage,
  );
</script>

<svelte:head>
  <title>Aggregator Offers Tool</title>
  <meta
    name="description"
    content="A role-aware operations overview surfacing the widgets relevant to your access."
  />
</svelte:head>

<div class="relative isolate overflow-hidden">
  <div class="bg-background absolute inset-0 -z-20"></div>
  <div
    class="absolute inset-x-0 top-0 -z-10 h-[30rem] bg-[radial-gradient(circle_at_top_left,_color-mix(in_oklab,var(--color-chart-2)_18%,transparent),transparent_36%),radial-gradient(circle_at_86%_16%,_color-mix(in_oklab,var(--color-chart-1)_24%,transparent),transparent_26%)]"
  ></div>
  <div
    class="bg-chart-2/10 absolute -top-16 left-10 -z-10 size-56 rounded-full blur-3xl"
  ></div>
  <div
    class="bg-chart-1/12 absolute top-52 right-0 -z-10 size-72 rounded-full blur-3xl"
  ></div>
  <div
    class="bg-chart-3/10 absolute bottom-12 left-1/3 -z-10 size-64 rounded-full blur-3xl"
  ></div>

  <main
    class="mx-auto flex min-h-screen max-w-7xl flex-col gap-10 px-4 py-8 sm:px-6 lg:px-8 lg:py-12"
  >
    <section
      class="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_auto] lg:items-end"
    >
      <div class="space-y-5">
        <Badge
          variant="outline"
          class="border-primary/20 bg-background/85 text-muted-foreground px-3 py-1 text-[0.7rem] tracking-[0.24em] uppercase shadow-sm backdrop-blur"
        >
          Home overview
        </Badge>

        <div class="space-y-4">
          <h1
            class="max-w-4xl text-4xl font-semibold tracking-[-0.05em] text-balance sm:text-5xl lg:text-6xl"
          >
            Dashboard
          </h1>
          <p
            class="text-muted-foreground max-w-3xl text-base leading-7 sm:text-lg"
          >
            Each widget below reflects the access you hold — offers, approvals,
            user management, or image-generation usage. The more roles you have,
            the more you see.
          </p>
        </div>
      </div>
    </section>

    {#if data.offers}
      <section class="space-y-4">
        <div class="space-y-1">
          <p
            class="text-sm font-semibold tracking-[0.18em] text-zinc-500 uppercase"
          >
            Offers
          </p>
          <h2 class="text-2xl font-semibold tracking-[-0.03em]">
            Keep the offer board readable before campaigns drift out of view
          </h2>
        </div>
        <div class="grid gap-5 xl:grid-cols-3">
          {#each widgetCards as widget (widget.title)}
            <OfferStatusWidget {...widget} />
          {/each}
        </div>
      </section>
    {/if}

    {#if data.approvals || data.users}
      <section class="space-y-4">
        <div class="space-y-1">
          <p
            class="text-sm font-semibold tracking-[0.18em] text-zinc-500 uppercase"
          >
            Review &amp; administration
          </p>
          <h2 class="text-2xl font-semibold tracking-[-0.03em]">
            What's waiting on you
          </h2>
        </div>
        <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {#if data.approvals}
            <MetricLinkCard
              eyebrow="Approvals"
              title="Pending submissions"
              metric={data.approvals.pendingCount}
              metricLabel="awaiting review"
              description="Staged pricing updates waiting to be approved before they are written into ClickHouse."
              href="/admin/pending-submissions"
              cta="Review submissions"
            />
          {/if}
          {#if data.users}
            <MetricLinkCard
              eyebrow="User management"
              title="Users"
              metric={data.users.userCount}
              metricLabel="internal accounts"
              description="Maintain internal accounts, roles, and brand assignments."
              href="/admin/users"
              cta="Manage users"
            />
          {/if}
        </div>
      </section>
    {/if}

    {#if data.usage}
      <section class="space-y-4">
        <div class="space-y-1">
          <p
            class="text-sm font-semibold tracking-[0.18em] text-zinc-500 uppercase"
          >
            Image generation
          </p>
          <h2 class="text-2xl font-semibold tracking-[-0.03em]">
            Usage across every account
          </h2>
        </div>
        <UsageSummaryWidget
          summary={data.usage.summary}
          href="/admin/image-generator-usage"
        />
      </section>
    {/if}

    {#if !hasAnyWidget}
      <section
        class="border-border/70 bg-background/88 rounded-3xl border p-10 text-center shadow-sm backdrop-blur"
      >
        <p class="text-lg font-semibold tracking-[-0.02em]">
          No widgets for your roles yet
        </p>
        <p
          class="text-muted-foreground mx-auto mt-2 max-w-md text-sm leading-6"
        >
          Your account doesn't have a role that surfaces dashboard widgets yet.
          Ask an administrator to grant you the relevant role to see offers,
          approvals, user management, or usage here.
        </p>
      </section>
    {/if}
  </main>
</div>
