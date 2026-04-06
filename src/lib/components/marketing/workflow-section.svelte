<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import type { WorkflowCard } from "$lib/services/landing-content.js";

  type Props = {
    eyebrow: string;
    title: string;
    description: string;
    cards: readonly WorkflowCard[];
  };

  let { eyebrow, title, description, cards }: Props = $props();
</script>

<section id="workflow" class="space-y-8">
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

  <div class="grid gap-5 lg:grid-cols-3">
    {#each cards as card}
      <Card.Root
        class="border-border/70 bg-background/80 shadow-sm backdrop-blur transition-transform duration-200 hover:-translate-y-1 hover:shadow-lg"
      >
        <Card.Header class="gap-4">
          <Badge
            variant="secondary"
            class="w-fit rounded-full px-3 py-1 font-mono text-[0.7rem] tracking-[0.18em] uppercase"
          >
            {card.stage}
          </Badge>
          <div class="space-y-3">
            <Card.Title class="text-2xl leading-tight tracking-[-0.03em]"
              >{card.title}</Card.Title
            >
            <Card.Description class="text-muted-foreground text-sm leading-7">
              {card.description}
            </Card.Description>
          </div>
        </Card.Header>
        <Card.Content>
          <ul class="text-muted-foreground space-y-3 text-sm">
            {#each card.points as point}
              <li
                class="border-border/70 bg-secondary/45 flex items-center gap-3 rounded-full border px-4 py-2.5"
              >
                <span class="bg-chart-2 size-2 rounded-full"></span>
                <span>{point}</span>
              </li>
            {/each}
          </ul>
        </Card.Content>
      </Card.Root>
    {/each}
  </div>
</section>
