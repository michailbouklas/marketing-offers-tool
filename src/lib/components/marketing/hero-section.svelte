<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import {
    Button,
    type ButtonVariant,
  } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import type {
    HeroPreviewItem,
    LandingAction,
    LandingStat,
  } from "$lib/services/landing-content.js";

  type Props = {
    eyebrow: string;
    title: string;
    description: string;
    tags: readonly string[];
    stats: readonly LandingStat[];
    preview: readonly HeroPreviewItem[];
    primaryAction: LandingAction;
    secondaryAction: LandingAction;
  };

  let {
    eyebrow,
    title,
    description,
    tags,
    stats,
    preview,
    primaryAction,
    secondaryAction,
  }: Props = $props();

  const resolveVariant = (variant?: LandingAction["variant"]): ButtonVariant =>
    variant ?? "default";
</script>

<section
  id="top"
  class="grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)] lg:items-center"
>
  <div class="space-y-8">
    <div class="space-y-5">
      <Badge
        variant="outline"
        class="border-primary/20 bg-background/80 text-muted-foreground px-3 py-1 text-[0.7rem] tracking-[0.24em] uppercase shadow-sm backdrop-blur"
      >
        {eyebrow}
      </Badge>
      <div class="space-y-4">
        <h1
          class="max-w-3xl text-5xl leading-none font-semibold tracking-[-0.04em] text-balance sm:text-6xl lg:text-7xl"
        >
          {title}
        </h1>
        <p class="text-muted-foreground max-w-2xl text-lg leading-8 sm:text-xl">
          {description}
        </p>
      </div>
    </div>

    <div class="flex flex-wrap gap-3">
      {#each tags as tag}
        <Badge
          variant="secondary"
          class="rounded-full px-3 py-1 text-sm shadow-sm"
        >
          {tag}
        </Badge>
      {/each}
    </div>

    <div class="flex flex-col gap-3 sm:flex-row">
      <Button
        href={primaryAction.href}
        variant={resolveVariant(primaryAction.variant)}
        class="min-w-44 rounded-full px-6"
      >
        {primaryAction.label}
      </Button>
      <Button
        href={secondaryAction.href}
        variant={resolveVariant(secondaryAction.variant)}
        class="min-w-44 rounded-full px-6"
      >
        {secondaryAction.label}
      </Button>
    </div>

    <div class="grid gap-4 sm:grid-cols-3">
      {#each stats as stat}
        <div
          class="border-border/70 bg-background/85 rounded-2xl border p-4 shadow-sm backdrop-blur"
        >
          <p class="text-3xl font-semibold tracking-[-0.04em]">{stat.value}</p>
          <p class="text-muted-foreground mt-2 text-sm leading-6">
            {stat.label}
          </p>
        </div>
      {/each}
    </div>
  </div>

  <Card.Root
    class="border-border/70 bg-background/80 shadow-primary/5 relative overflow-hidden shadow-xl backdrop-blur"
  >
    <div
      class="from-chart-1/18 via-chart-2/12 to-chart-3/18 absolute inset-x-0 top-0 h-28 bg-linear-to-r"
      aria-hidden="true"
    ></div>
    <Card.Header class="relative gap-3">
      <div class="flex items-center justify-between gap-3">
        <Badge class="rounded-full px-3 py-1">Live workflow frame</Badge>
        <p
          class="text-muted-foreground font-mono text-xs tracking-[0.2em] uppercase"
        >
          review surface
        </p>
      </div>
      <Card.Title class="max-w-sm text-3xl leading-tight tracking-[-0.03em]">
        One screen that tells the team what deserves attention next.
      </Card.Title>
      <Card.Description
        class="text-muted-foreground max-w-md text-base leading-7"
      >
        A focused blend of signal, sequence, and handoff context so the next
        move is obvious.
      </Card.Description>
    </Card.Header>
    <Card.Content class="relative grid gap-4">
      {#each preview as item}
        <div
          class="border-border/70 bg-background/90 grid gap-3 rounded-2xl border p-4 shadow-sm sm:grid-cols-[8rem_minmax(0,1fr)] sm:items-center"
        >
          <div>
            <p
              class="text-muted-foreground font-mono text-xs tracking-[0.22em] uppercase"
            >
              {item.label}
            </p>
            <p class="mt-2 text-lg font-semibold tracking-[-0.03em]">
              {item.value}
            </p>
          </div>
          <p class="text-muted-foreground text-sm leading-6">{item.note}</p>
        </div>
      {/each}
    </Card.Content>
  </Card.Root>
</section>
