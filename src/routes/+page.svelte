<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import OfferStatusWidget from "$lib/components/home/offer-status-widget.svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const widgetCards = $derived([
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
      widget: data.widgets.activeOffers,
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
      widget: data.widgets.expiringSoon,
    },
    {
      title: "Recently expired",
      eyebrow: "Last 48 hours",
      description:
        "Offers whose end date passed during the last two days and may need follow-up.",
      countLabel: "just wrapped",
      emptyMessage:
        "No recent expirations in the last two days. The board is clear.",
      footerLabel: "Useful for performance checks and post-campaign wrap-up.",
      tone: "expired" as const,
      widget: data.widgets.recentlyExpired,
    },
  ]);
  const adminQuickCards = $derived(
    data.userRole === "admin"
      ? [
          {
            title: "Pending submissions",
            description:
              "Review staged pricing updates before they are written into ClickHouse.",
            href: "/admin/pending-submissions",
          },
          {
            title: "Dim offers explorer",
            description:
              "Search, filter, and sort every row in `dim_offers` from the admin workspace.",
            href: "/admin/dim-offers",
          },
          {
            title: "Users",
            description:
              "Maintain internal accounts, roles, and brand assignments.",
            href: "/admin/users",
          },
        ]
      : [],
  );
</script>

<svelte:head>
  <title>Aggregator Offers Tool</title>
  <meta
    name="description"
    content="An offer operations overview with live widgets for active, expiring, and recently expired campaigns."
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
            Keep the offer board readable before campaigns quietly drift out of
            view.
          </h1>
          <p
            class="text-muted-foreground max-w-3xl text-base leading-7 sm:text-lg"
          >
            These widgets turn the home page into an at-a-glance operations
            surface for what is live, what needs attention next, and what just
            ended.
          </p>
        </div>
      </div>

      <div class="flex flex-col gap-3 sm:flex-row lg:flex-col">
        <Button href="/aggregator-offers" class="rounded-full px-6"
          >Open offers registry</Button
        >
        <Button
          href="/aggregator-offers"
          variant="outline"
          class="rounded-full px-6"
        >
          Review all campaigns
        </Button>
      </div>
    </section>

    <section class="grid gap-5 xl:grid-cols-3">
      {#each widgetCards as widget (widget.title)}
        <OfferStatusWidget {...widget} />
      {/each}
    </section>

    {#if adminQuickCards.length > 0}
      <section class="space-y-4">
        <div class="space-y-1">
          <p
            class="text-sm font-semibold tracking-[0.18em] text-zinc-500 uppercase"
          >
            Admin workspace
          </p>
          <h2 class="text-2xl font-semibold tracking-[-0.03em]">
            Jump straight into review tools
          </h2>
        </div>

        <div class="grid gap-4 lg:grid-cols-3">
          {#each adminQuickCards as card (card.href)}
            <a
              href={card.href}
              class="border-border/70 bg-background/88 hover:bg-background flex h-full flex-col justify-between rounded-3xl border p-6 shadow-sm backdrop-blur transition-colors"
            >
              <div class="space-y-3">
                <p class="text-lg font-semibold tracking-[-0.02em]">
                  {card.title}
                </p>
                <p class="text-muted-foreground text-sm leading-6">
                  {card.description}
                </p>
              </div>

              <div
                class="mt-6 inline-flex items-center gap-2 text-sm font-medium"
              >
                <span>Open</span>
                <span aria-hidden="true">-></span>
              </div>
            </a>
          {/each}
        </div>
      </section>
    {/if}
  </main>
</div>
