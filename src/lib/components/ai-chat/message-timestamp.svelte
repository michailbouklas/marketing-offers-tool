<script lang="ts">
  // Stored messages carry their real timestamp in metadata.createdAt (set by
  // the history endpoint); freshly streamed messages have no metadata, so the
  // mount time — the moment the completed message's footer renders — is used.
  let { metadata }: { metadata?: unknown } = $props();

  const mountedAt = new Date();

  const createdAt = $derived.by(() => {
    if (metadata && typeof metadata === "object" && "createdAt" in metadata) {
      const raw = (metadata as { createdAt?: unknown }).createdAt;
      if (typeof raw === "string" || typeof raw === "number") {
        const parsed = new Date(raw);
        if (!Number.isNaN(parsed.getTime())) {
          return parsed;
        }
      }
    }
    return mountedAt;
  });
</script>

<span class="text-muted-foreground text-xs">
  {createdAt.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })}
</span>
