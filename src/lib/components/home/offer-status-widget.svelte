<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import * as Card from "$lib/components/ui/card/index.js";

  type Tone = "active" | "warning" | "expired";

  type WidgetPreview = {
    id: number;
    offer_id: string;
    name: string;
    brand: {
      id: number;
      name: string;
      slug: string;
      active: boolean;
    };
    aggregator: string;
    ends_at: Date;
  };

  type WidgetData = {
    count: number;
    href: string;
    preview: WidgetPreview[];
  };

  type Props = {
    title: string;
    eyebrow: string;
    description: string;
    countLabel: string;
    emptyMessage: string;
    footerLabel: string;
    tone: Tone;
    widget: WidgetData;
  };

  let {
    title,
    eyebrow,
    description,
    countLabel,
    emptyMessage,
    footerLabel,
    tone,
    widget,
  }: Props = $props();

  const dateFormatter = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
  });

  const now = new Date();

  const toneClasses = {
    active: {
      accentClass:
        "from-chart-2/22 via-chart-2/8 to-transparent before:bg-chart-2/18",
      badgeClass: "border-chart-2/30 bg-chart-2/12 text-foreground",
      countClass: "text-chart-2",
      iconWrapperClass: "bg-chart-2/14 text-chart-2",
    },
    warning: {
      accentClass:
        "from-chart-1/24 via-chart-1/8 to-transparent before:bg-chart-1/18",
      badgeClass: "border-chart-1/30 bg-chart-1/12 text-foreground",
      countClass: "text-chart-1",
      iconWrapperClass: "bg-chart-1/14 text-chart-1",
    },
    expired: {
      accentClass:
        "from-chart-3/24 via-chart-3/8 to-transparent before:bg-chart-3/18",
      badgeClass: "border-chart-3/30 bg-chart-3/12 text-foreground",
      countClass: "text-chart-3",
      iconWrapperClass: "bg-chart-3/14 text-chart-3",
    },
  } as const;

  function formatDate(value: Date) {
    return dateFormatter.format(value);
  }

  function formatAggregatorLabel(value: string) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function getDayDiff(value: Date) {
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const startOfTarget = new Date(value);
    startOfTarget.setHours(0, 0, 0, 0);

    return Math.round(
      (startOfTarget.getTime() - startOfToday.getTime()) / 86400000,
    );
  }

  function getRelativeEndLabel(value: Date) {
    const dayDiff = getDayDiff(value);

    if (dayDiff === 0) {
      return value < now ? "Expired today" : "Ends today";
    }

    if (dayDiff === 1) {
      return "Ends tomorrow";
    }

    if (dayDiff === -1) {
      return "Expired yesterday";
    }

    if (dayDiff > 1) {
      return `Ends in ${dayDiff} days`;
    }

    return `Expired ${Math.abs(dayDiff)} days ago`;
  }

  function getEndLabelPrefix() {
    return tone === "expired" ? "Ended" : "Ends";
  }
</script>

<a href={widget.href} class="group block">
  <Card.Root
    class="border-border/70 bg-background/82 relative h-full overflow-hidden rounded-3xl border shadow-xl backdrop-blur transition-all duration-200 group-hover:-translate-y-1 group-hover:shadow-2xl"
  >
    <div
      class={`absolute inset-x-0 top-0 h-32 bg-linear-to-r before:absolute before:top-5 before:right-5 before:size-28 before:rounded-full before:blur-3xl ${toneClasses[tone].accentClass}`}
      aria-hidden="true"
    ></div>

    <Card.Header class="relative gap-4 pb-4">
      <div class="flex items-start justify-between gap-4">
        <Badge
          variant="outline"
          class={`px-3 py-1 ${toneClasses[tone].badgeClass}`}
        >
          {eyebrow}
        </Badge>
        <div
          class={`flex size-10 items-center justify-center rounded-2xl ${toneClasses[tone].iconWrapperClass}`}
          aria-hidden="true"
        >
          {#if tone === "active"}
            <svg
              viewBox="0 0 24 24"
              class="size-5 fill-none stroke-current"
              stroke-width="1.8"
            >
              <path
                d="M4 12h4l2-5 4 10 2-5h4"
                stroke-linecap="round"
                stroke-linejoin="round"
              ></path>
            </svg>
          {:else if tone === "warning"}
            <svg
              viewBox="0 0 24 24"
              class="size-5 fill-none stroke-current"
              stroke-width="1.8"
            >
              <circle
                cx="12"
                cy="13"
                r="8"
                stroke-linecap="round"
                stroke-linejoin="round"
              ></circle>
              <path
                d="M12 9v4l2 2"
                stroke-linecap="round"
                stroke-linejoin="round"
              ></path>
              <path d="M9 3 7 5" stroke-linecap="round" stroke-linejoin="round"
              ></path>
              <path
                d="M15 3 17 5"
                stroke-linecap="round"
                stroke-linejoin="round"
              ></path>
            </svg>
          {:else}
            <svg
              viewBox="0 0 24 24"
              class="size-5 fill-none stroke-current"
              stroke-width="1.8"
            >
              <path
                d="M12 8v5l3 2"
                stroke-linecap="round"
                stroke-linejoin="round"
              ></path>
              <path
                d="M3 12a9 9 0 1 0 3-6.7"
                stroke-linecap="round"
                stroke-linejoin="round"
              ></path>
              <path d="M3 4v4h4" stroke-linecap="round" stroke-linejoin="round"
              ></path>
            </svg>
          {/if}
        </div>
      </div>

      <div class="space-y-3">
        <div class="flex items-end justify-between gap-4">
          <p
            class={`text-5xl font-semibold tracking-[-0.05em] ${toneClasses[tone].countClass}`}
          >
            {widget.count}
          </p>
          <p
            class="text-muted-foreground font-mono text-xs tracking-[0.22em] uppercase"
          >
            {countLabel}
          </p>
        </div>

        <div class="space-y-1.5">
          <Card.Title class="text-2xl tracking-[-0.03em]">{title}</Card.Title>
          <Card.Description class="text-sm leading-6">
            {description}
          </Card.Description>
        </div>
      </div>
    </Card.Header>

    <Card.Content class="relative flex h-full flex-col gap-4 pt-0">
      {#if widget.preview.length > 0}
        <div class="space-y-3">
          {#each widget.preview as offer}
            <article
              class="border-border/70 bg-background/88 group-hover:bg-background/94 rounded-2xl border p-4 shadow-sm transition-colors duration-200"
            >
              <div class="flex items-start justify-between gap-4">
                <div class="space-y-1">
                  <p class="text-sm font-semibold tracking-[-0.02em]">
                    {offer.name}
                  </p>
                  <p class="text-muted-foreground text-xs leading-5">
                    {offer.brand.name} - {formatAggregatorLabel(
                      offer.aggregator,
                    )}
                  </p>
                </div>
                <Badge
                  variant="secondary"
                  class="rounded-full px-2.5 py-1 text-[0.68rem]"
                >
                  {offer.offer_id}
                </Badge>
              </div>

              <div class="mt-3 flex items-center justify-between gap-3">
                <p class="text-muted-foreground text-sm">
                  {getEndLabelPrefix()}
                  {formatDate(offer.ends_at)}
                </p>
                <p class="text-muted-foreground text-xs font-medium">
                  {getRelativeEndLabel(offer.ends_at)}
                </p>
              </div>
            </article>
          {/each}
        </div>
      {:else}
        <div
          class="border-border/70 bg-background/72 flex min-h-52 items-center rounded-2xl border border-dashed px-5 py-6"
        >
          <p class="text-muted-foreground text-sm leading-6">{emptyMessage}</p>
        </div>
      {/if}

      <div class="mt-auto flex items-center justify-between gap-3 pt-2">
        <p class="text-muted-foreground max-w-[16rem] text-sm leading-6">
          {footerLabel}
        </p>
        <span
          class="text-foreground inline-flex items-center gap-2 text-sm font-medium"
        >
          View matching offers
          <svg
            viewBox="0 0 24 24"
            class="size-4 fill-none stroke-current"
            stroke-width="1.8"
          >
            <path d="M5 12h14" stroke-linecap="round" stroke-linejoin="round"
            ></path>
            <path
              d="m13 6 6 6-6 6"
              stroke-linecap="round"
              stroke-linejoin="round"
            ></path>
          </svg>
        </span>
      </div>
    </Card.Content>
  </Card.Root>
</a>
