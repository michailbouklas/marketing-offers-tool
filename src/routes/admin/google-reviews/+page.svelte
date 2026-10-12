<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import TagsIcon from "@lucide/svelte/icons/tags";
  import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
  import type { Component } from "svelte";

  type GoogleReviewsAdminFeature = {
    href: string;
    title: string;
    description: string;
    icon: Component;
  };

  const features: GoogleReviewsAdminFeature[] = [
    {
      href: "/admin/google-reviews/categories",
      title: "Review categories",
      description:
        "Rename categories, rewrite their summaries, and activate or deactivate them in bulk. Changes are written to the scraper's source database and replicate to the analytics pages.",
      icon: TagsIcon,
    },
  ];
</script>

<svelte:head>
  <title>Google Reviews admin | Aggregator Offers Tool</title>
  <meta
    name="description"
    content="Admin tools for the Google Reviews pipeline: curate review categories at the source database."
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
      <Badge
        variant="outline"
        class="px-3 py-1 text-[0.7rem] tracking-[0.22em] uppercase"
      >
        Admin workspace
      </Badge>
      <h1 class="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
        Google Reviews
      </h1>
      <p class="text-muted-foreground max-w-2xl text-base leading-7">
        Tools that edit the Google Reviews scraper's source database. Pick a
        tool below.
      </p>
    </section>

    <section class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {#each features as feature (feature.href)}
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
      {/each}
    </section>
  </main>
</div>
