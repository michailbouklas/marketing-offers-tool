<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";

  type Props = {
    summary: {
      totalImages: number;
      totalUsers: number;
      completed: number;
      failed: number;
    };
    href: string;
  };

  let { summary, href }: Props = $props();

  const numberFormatter = new Intl.NumberFormat();

  const stats = $derived([
    {
      label: "Total images",
      value: numberFormatter.format(summary.totalImages),
    },
    {
      label: "Active users",
      value: numberFormatter.format(summary.totalUsers),
    },
    { label: "Completed", value: numberFormatter.format(summary.completed) },
    { label: "Failed", value: numberFormatter.format(summary.failed) },
  ]);
</script>

<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
  {#each stats as stat (stat.label)}
    <Card.Root class="border-border/70 bg-background/90 backdrop-blur">
      <Card.Header class="pb-2">
        <Card.Description>{stat.label}</Card.Description>
        <Card.Title class="text-3xl tracking-[-0.03em]">
          {stat.value}
        </Card.Title>
      </Card.Header>
    </Card.Root>
  {/each}
</div>

<a {href} class="group mt-4 inline-flex items-center gap-2 text-sm font-medium">
  <span>Open image generator usage</span>
  <ArrowRightIcon
    class="size-4 transition-transform group-hover:translate-x-1"
  />
</a>
