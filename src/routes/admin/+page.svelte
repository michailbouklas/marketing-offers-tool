<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import InboxIcon from "@lucide/svelte/icons/inbox";
  import DatabaseIcon from "@lucide/svelte/icons/database";
  import UsersIcon from "@lucide/svelte/icons/users";
  import StoreIcon from "@lucide/svelte/icons/store";
  import ImageIcon from "@lucide/svelte/icons/image";
  import ActivityIcon from "@lucide/svelte/icons/activity";
  import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
  import type { Component } from "svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  type AdminFeature = {
    href: string;
    title: string;
    description: string;
    icon: Component;
    accessKey: keyof PageData["access"];
  };

  const features: AdminFeature[] = [
    {
      href: "/admin/pending-submissions",
      title: "Pending submissions",
      description:
        "Review staged pricing updates submitted by data-quality reviewers before they are written into ClickHouse.",
      icon: InboxIcon,
      accessKey: "pendingSubmissions",
    },
    {
      href: "/admin/dim-offers",
      title: "Dim offers explorer",
      description:
        "Search, filter, and sort every row in `dim_offers`. Drill into an item to see its audit history.",
      icon: DatabaseIcon,
      accessKey: "dimOffers",
    },
    {
      href: "/admin/users",
      title: "Users",
      description:
        "Create internal accounts, change roles, and assign brands to teammates.",
      icon: UsersIcon,
      accessKey: "users",
    },
    {
      href: "/admin/brands",
      title: "Brands",
      description:
        "Manage brand guidelines and reference assets used by the image generator.",
      icon: StoreIcon,
      accessKey: "brands",
    },
    {
      href: "/admin/image-generator-usage",
      title: "Image generator usage",
      description:
        "Track image-generation activity across all users over time, with totals, success rate, and the most active accounts.",
      icon: ImageIcon,
      accessKey: "imageUsage",
    },
    {
      href: "/admin/metrics",
      title: "User metrics",
      description:
        "See per-user activity such as last login, active sessions, and account age across every account.",
      icon: ActivityIcon,
      accessKey: "metrics",
    },
  ];

  const visibleFeatures = $derived(
    features.filter((feature) => data.access[feature.accessKey]),
  );
</script>

<svelte:head>
  <title>Admin | Aggregator Offers Tool</title>
  <meta
    name="description"
    content="Admin workspace landing page listing every admin-only feature in the tool."
  />
</svelte:head>

<div class="relative isolate min-h-screen overflow-hidden">
  <div class="bg-background absolute inset-0 -z-20"></div>
  <div
    class="absolute inset-x-0 top-0 -z-10 h-[20rem] bg-[radial-gradient(circle_at_top_left,_color-mix(in_oklab,var(--color-chart-1)_20%,transparent),transparent_32%),radial-gradient(circle_at_90%_18%,_color-mix(in_oklab,var(--color-chart-2)_18%,transparent),transparent_28%)]"
  ></div>

  <main
    class="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-10"
  >
    <section class="space-y-3">
      <p
        class="text-sm font-semibold tracking-[0.18em] text-zinc-500 uppercase"
      >
        Admin workspace
      </p>
      <h1 class="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
        Everything that needs an admin role
      </h1>
      <p class="text-muted-foreground max-w-2xl text-base leading-7">
        Pick a tool below. You only see the tools your roles grant access to.
      </p>
    </section>

    <section class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {#each visibleFeatures as feature (feature.href)}
        <a
          href={feature.href}
          class="focus-visible:ring-ring/50 group block rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          <Card.Root
            class="border-border/70 bg-background/90 group-hover:border-border h-full backdrop-blur transition-colors group-hover:shadow-md"
          >
            <Card.Header>
              <div class="flex items-start gap-3">
                <div
                  class="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-xl"
                >
                  <feature.icon class="size-5" />
                </div>
                <div class="space-y-1">
                  <Card.Title class="text-xl tracking-[-0.02em]">
                    {feature.title}
                  </Card.Title>
                </div>
              </div>
            </Card.Header>
            <Card.Content>
              <p class="text-muted-foreground text-sm leading-6">
                {feature.description}
              </p>
            </Card.Content>
            <Card.Footer>
              <span
                class="text-primary inline-flex items-center gap-2 text-sm font-medium"
              >
                Open
                <ArrowRightIcon
                  class="size-4 transition-transform group-hover:translate-x-1"
                />
              </span>
            </Card.Footer>
          </Card.Root>
        </a>
      {:else}
        <p class="text-muted-foreground text-sm">
          You don't have access to any admin tools yet. Ask an administrator to
          grant you the relevant role.
        </p>
      {/each}
    </section>
  </main>
</div>
