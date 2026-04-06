<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import {
    Button,
    type ButtonVariant,
  } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import type {
    FoundationCard,
    LandingAction,
  } from "$lib/services/landing-content.js";

  type Props = {
    eyebrow: string;
    title: string;
    description: string;
    cards: readonly FoundationCard[];
    cta: LandingAction;
  };

  let { eyebrow, title, description, cards, cta }: Props = $props();

  const resolveVariant = (variant?: LandingAction["variant"]): ButtonVariant =>
    variant ?? "default";
</script>

<section id="foundation" class="space-y-8">
  <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
    <div class="max-w-3xl space-y-4">
      <Badge
        variant="outline"
        class="text-muted-foreground rounded-full px-3 py-1 text-[0.72rem] tracking-[0.22em] uppercase"
      >
        {eyebrow}
      </Badge>
      <h2
        class="text-3xl font-semibold tracking-[-0.04em] text-balance sm:text-4xl"
      >
        {title}
      </h2>
      <p class="text-muted-foreground text-base leading-7 sm:text-lg">
        {description}
      </p>
    </div>
    <Button
      href={cta.href}
      variant={resolveVariant(cta.variant)}
      class="rounded-full px-6"
    >
      {cta.label}
    </Button>
  </div>

  <div class="grid gap-5 lg:grid-cols-3">
    {#each cards as card}
      <Card.Root
        class="border-border/70 bg-background/80 shadow-sm backdrop-blur"
      >
        <Card.Header class="gap-4">
          <Badge
            variant="secondary"
            class="w-fit rounded-full px-3 py-1 text-[0.72rem] tracking-[0.18em] uppercase"
          >
            {card.kicker}
          </Badge>
          <Card.Title class="text-2xl leading-tight tracking-[-0.03em]"
            >{card.title}</Card.Title
          >
        </Card.Header>
        <Card.Content>
          <p class="text-muted-foreground text-sm leading-7">
            {card.description}
          </p>
        </Card.Content>
      </Card.Root>
    {/each}
  </div>
</section>
