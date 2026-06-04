<script lang="ts">
  import UserMetricsTable from "$lib/components/admin/user-metrics-table.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>User metrics | Aggregator Offers Tool</title>
  <meta
    name="description"
    content="Admin dashboard showing per-user activity metrics such as last login and active sessions."
  />
</svelte:head>

<div class="relative isolate min-h-screen overflow-hidden">
  <div class="bg-background absolute inset-0 -z-20"></div>
  <div
    class="absolute inset-x-0 top-0 -z-10 h-[20rem] bg-[radial-gradient(circle_at_top_left,_color-mix(in_oklab,var(--color-chart-1)_20%,transparent),transparent_32%),radial-gradient(circle_at_90%_18%,_color-mix(in_oklab,var(--color-chart-2)_18%,transparent),transparent_28%)]"
  ></div>

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
          Admin workspace
        </p>
        <h1 class="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
          User metrics
        </h1>
        <p class="text-muted-foreground max-w-2xl text-base leading-7">
          Per-user activity across the tool, starting with login activity. More
          metrics will land here over time.
        </p>
      </div>

      <Button href="/admin" variant="outline">
        <ArrowLeftIcon class="size-4" />
        Back to admin
      </Button>
    </section>

    <!-- Each metric lives in its own card so future metrics (charts, other
         tables) can slot in as additional sections below. -->
    <Card.Root
      class="border-border/70 bg-background/90 overflow-hidden backdrop-blur"
    >
      <Card.Header>
        <Card.Title class="text-2xl tracking-[-0.03em]">
          Login activity
        </Card.Title>
        <Card.Description>
          Last login is based on each user's most recent session, so accounts
          whose sessions have expired and been cleaned up show "Never".
        </Card.Description>
      </Card.Header>
      <Card.Content>
        <UserMetricsTable metrics={data.metrics} />
      </Card.Content>
    </Card.Root>
  </main>
</div>
