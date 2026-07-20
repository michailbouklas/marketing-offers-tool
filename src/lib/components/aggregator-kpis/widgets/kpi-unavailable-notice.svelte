<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import InfoIcon from "@lucide/svelte/icons/info";

  let {
    title = "Not tracked for Wolt yet",
    message = "This KPI is only scraped for Foody. Switch the platform to Foody to view it.",
  }: {
    title?: string;
    message?: string;
  } = $props();
</script>

<Card.Root>
  <Card.Content class="flex flex-col items-center gap-3 py-14 text-center">
    <div
      class="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-full"
    >
      <InfoIcon class="size-5" />
    </div>
    <p class="text-lg font-medium">{title}</p>
    <p class="text-muted-foreground max-w-md text-sm leading-6">{message}</p>
  </Card.Content>
</Card.Root>
