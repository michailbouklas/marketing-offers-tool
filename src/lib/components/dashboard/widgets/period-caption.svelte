<script lang="ts">
  import type { SalesScoped } from "$lib/dashboard/widgets";

  let { data }: { data: SalesScoped } = $props();
</script>

<p class="text-muted-foreground mb-2 text-xs">
  <span class="text-foreground font-medium">{data.brandName}</span>
  · {data.from} – {data.to}
</p>
