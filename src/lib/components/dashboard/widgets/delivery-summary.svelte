<script lang="ts">
  import type { DeliveryWidgetData } from "$lib/dashboard/widgets";
  import {
    formatSalesAmount,
    formatSalesCount,
  } from "$lib/services/sales-dashboard";
  import PeriodCaption from "./period-caption.svelte";

  let { data }: { data: DeliveryWidgetData } = $props();

  const show = (value: number | null) =>
    value === null ? "–" : formatSalesAmount(value);
</script>

<PeriodCaption {data} />
<dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm tabular-nums">
  <div>
    <dt class="text-muted-foreground text-xs">Net sales</dt>
    <dd class="text-lg font-semibold">{show(data.range.net)}</dd>
  </div>
  <div>
    <dt class="text-muted-foreground text-xs">Orders</dt>
    <dd class="text-lg font-semibold">{formatSalesCount(data.range.orders)}</dd>
  </div>
  <div>
    <dt class="text-muted-foreground text-xs">Avg ticket</dt>
    <dd>{show(data.range.atv)}</dd>
  </div>
  <div>
    <dt class="text-muted-foreground text-xs">Discount</dt>
    <dd>{show(data.range.discount)}</dd>
  </div>
</dl>
{#if data.channels.length > 0}
  <ul class="mt-3 space-y-1.5 text-xs">
    {#each data.channels.slice(0, 5) as channel (channel.channel)}
      <li class="space-y-0.5">
        <div class="flex justify-between tabular-nums">
          <span>{channel.channel}</span>
          <span class="text-muted-foreground">
            {formatSalesAmount(channel.net)} · {Math.round(
              channel.share * 100,
            )}%
          </span>
        </div>
        <div class="bg-muted h-1.5 rounded-full">
          <div
            class="bg-primary h-1.5 rounded-full"
            style:width={`${channel.share * 100}%`}
          ></div>
        </div>
      </li>
    {/each}
  </ul>
{/if}
