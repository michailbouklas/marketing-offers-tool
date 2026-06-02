<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";

  type Props = {
    eyebrow: string;
    title: string;
    metric: number;
    metricLabel: string;
    description: string;
    href: string;
    cta: string;
  };

  let { eyebrow, title, metric, metricLabel, description, href, cta }: Props =
    $props();

  const formattedMetric = $derived(new Intl.NumberFormat().format(metric));
</script>

<a
  {href}
  class="border-border/70 bg-background/88 hover:bg-background group flex h-full flex-col justify-between rounded-3xl border p-6 shadow-sm backdrop-blur transition-colors"
>
  <div class="space-y-4">
    <Badge
      variant="outline"
      class="border-primary/20 bg-background/85 text-muted-foreground px-3 py-1 text-[0.7rem] tracking-[0.24em] uppercase shadow-sm"
    >
      {eyebrow}
    </Badge>

    <div class="space-y-1">
      <p class="text-lg font-semibold tracking-[-0.02em]">{title}</p>
      <div class="flex items-baseline gap-2">
        <span class="text-4xl font-semibold tracking-[-0.04em]">
          {formattedMetric}
        </span>
        <span class="text-muted-foreground text-sm">{metricLabel}</span>
      </div>
    </div>

    <p class="text-muted-foreground text-sm leading-6">{description}</p>
  </div>

  <div class="mt-6 inline-flex items-center gap-2 text-sm font-medium">
    <span>{cta}</span>
    <ArrowRightIcon
      class="size-4 transition-transform group-hover:translate-x-1"
    />
  </div>
</a>
