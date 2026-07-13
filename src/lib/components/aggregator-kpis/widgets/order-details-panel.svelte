<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Separator } from "$lib/components/ui/separator/index.js";
  import {
    formatKpiDateTime,
    type OrderDetails,
  } from "$lib/services/aggregator-kpis/aggregator-kpis";

  let {
    order,
    orderScrapedAt,
  }: {
    order: OrderDetails;
    orderScrapedAt: string | null;
  } = $props();

  // Money fields are raw display strings that can be legitimately null (the portal
  // omits the earnings block for a substantial minority of orders). Null = "not
  // shown", never €0 — so a totals line renders only when its string is present.
  type TotalLine = { label: string; value: string | null; emphasis?: boolean };

  const totalLines = $derived(
    [
      { label: "Subtotal", value: order.subtotal },
      {
        label:
          order.commissionRate === null
            ? "Commission"
            : `Commission (${order.commissionRate}%)`,
        value: order.commission,
      },
      { label: "Tax", value: order.taxCharge },
      {
        label: "Estimated earnings",
        value: order.estimatedEarnings,
        emphasis: true,
      },
    ].filter((line): line is TotalLine => line.value !== null),
  );

  const hasMeta = $derived(
    order.paymentMethod !== null || order.deliveryType !== null,
  );
</script>

<section class="space-y-4">
  <div class="flex flex-wrap items-center gap-2">
    <p class="text-sm font-medium">Order</p>
    {#if order.status}
      <Badge>{order.status}</Badge>
    {/if}
    <span class="text-muted-foreground font-mono text-xs">
      #{order.orderId}
    </span>
  </div>

  {#if order.timeline.length > 0}
    <ol class="space-y-0">
      {#each order.timeline as step, index (step.key + index)}
        <li class="flex gap-3">
          <!-- dot + connector line -->
          <div class="flex flex-col items-center">
            <span
              class="bg-primary mt-1.5 size-2.5 shrink-0 rounded-full"
              aria-hidden="true"
            ></span>
            {#if index < order.timeline.length - 1}
              <span class="bg-border w-px flex-1" aria-hidden="true"></span>
            {/if}
          </div>
          <div class="min-w-0 flex-1 pb-4">
            <div class="flex items-baseline justify-between gap-2">
              <span class="text-sm font-medium">{step.label}</span>
              {#if step.time}
                <span class="text-muted-foreground text-xs tabular-nums">
                  {step.time}
                </span>
              {/if}
            </div>
            {#each step.notes as note (note)}
              <p class="text-muted-foreground text-xs leading-5">{note}</p>
            {/each}
          </div>
        </li>
      {/each}
    </ol>
  {/if}

  {#if order.products.length > 0}
    <Card.Root>
      <Card.Content class="space-y-3 py-4">
        {#each order.products as product, index (product.name + index)}
          <div class="space-y-1">
            <div class="flex items-baseline justify-between gap-3 text-sm">
              <span class="min-w-0">
                {#if product.quantity !== null}
                  <span class="text-muted-foreground tabular-nums">
                    {product.quantity}×
                  </span>
                {/if}
                {product.name}
              </span>
              {#if product.price}
                <span class="shrink-0 tabular-nums">{product.price}</span>
              {/if}
            </div>
            {#each product.options as option, optionIndex (option.name + optionIndex)}
              <div
                class="text-muted-foreground flex items-baseline justify-between gap-3 pl-4 text-xs"
              >
                <span class="min-w-0">
                  {#if option.quantity !== null}
                    <span class="tabular-nums">{option.quantity}× </span>
                  {/if}
                  {option.name}
                </span>
                {#if option.price}
                  <span class="shrink-0 tabular-nums">{option.price}</span>
                {/if}
              </div>
            {/each}
          </div>
        {/each}
      </Card.Content>
    </Card.Root>
  {/if}

  {#if totalLines.length > 0}
    <div class="space-y-1.5 text-sm">
      {#each totalLines as line (line.label)}
        <div class="flex items-baseline justify-between gap-3">
          <span class="text-muted-foreground">{line.label}</span>
          <span class={["tabular-nums", line.emphasis && "font-medium"]}>
            {line.value}
          </span>
        </div>
      {/each}
    </div>
  {/if}

  {#if hasMeta}
    <div class="flex flex-wrap gap-2">
      {#if order.paymentMethod}
        <Badge variant="outline">{order.paymentMethod}</Badge>
      {/if}
      {#if order.deliveryType}
        <Badge variant="outline">{order.deliveryType}</Badge>
      {/if}
    </div>
  {/if}

  {#if orderScrapedAt}
    <Separator />
    <p class="text-muted-foreground text-xs">
      Order fetched {formatKpiDateTime(orderScrapedAt)}
    </p>
  {/if}
</section>
