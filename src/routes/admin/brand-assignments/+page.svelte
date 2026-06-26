<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import type { PageData } from "./$types";

  // Placeholder page — the interactive assignment UI is a follow-up task.
  // The server load + `/api/admin/brand-entities` endpoints are already live.
  let { data }: { data: PageData } = $props();
</script>

<div class="mx-auto flex max-w-3xl flex-col gap-6 p-6">
  <div class="flex flex-col gap-1">
    <h1 class="text-2xl font-semibold">Brand assignments</h1>
    <p class="text-muted-foreground text-sm">
      Group scraped competition restaurants and Google reviews businesses under
      a brand. The management UI is coming soon.
    </p>
  </div>

  <Card.Root>
    <Card.Header>
      <Card.Title>Current state</Card.Title>
    </Card.Header>
    <Card.Content class="flex gap-8 text-sm">
      <div>
        <div class="text-2xl font-semibold">{data.brands.length}</div>
        <div class="text-muted-foreground">brands</div>
      </div>
      <div>
        <div class="text-2xl font-semibold">{data.assignments.length}</div>
        <div class="text-muted-foreground">assignments</div>
      </div>
    </Card.Content>
  </Card.Root>
</div>
