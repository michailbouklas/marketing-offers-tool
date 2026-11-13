<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import ReleaseMarkdown from "$lib/components/releases/release-markdown.svelte";
  import type { ReleaseDetail } from "$lib/services/releases/releases";

  let { release }: { release: ReleaseDetail } = $props();
</script>

<div class="mb-2 space-y-1">
  <div class="flex items-center gap-2">
    <Badge variant="outline" class="font-mono">{release.version}</Badge>
    <p class="truncate font-medium">{release.title}</p>
  </div>
  <p class="text-muted-foreground text-xs">
    {new Date(release.createdAt).toLocaleDateString()}
    {#if release.createdByName}· {release.createdByName}{/if}
  </p>
</div>
<!-- Long notes scroll inside the card instead of stretching the grid row. -->
<ReleaseMarkdown body={release.body} class="max-h-80 overflow-y-auto" />
