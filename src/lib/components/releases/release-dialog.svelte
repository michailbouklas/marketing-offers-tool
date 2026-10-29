<script lang="ts">
  import { untrack } from "svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import {
    formatReleaseDate,
    type ReleaseDetail,
  } from "$lib/services/releases/releases";
  import ReleaseMarkdown from "./release-markdown.svelte";

  /**
   * One dialog for every place a release is read: the login announcement,
   * the header list and the admin table. `onDismiss` fires once whenever the
   * dialog closes, whichever way (button, X, Escape, overlay click).
   */
  type Props = {
    release: ReleaseDetail | null;
    open?: boolean;
    loading?: boolean;
    dismissLabel?: string;
    onDismiss?: () => void;
  };

  let {
    release,
    open = $bindable(false),
    loading = false,
    dismissLabel = "Close",
    onDismiss,
  }: Props = $props();

  let wasOpen = false;
  $effect(() => {
    if (open) {
      wasOpen = true;
      return;
    }
    if (wasOpen) {
      wasOpen = false;
      untrack(() => onDismiss?.());
    }
  });
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
    <Dialog.Header>
      <Dialog.Title class="text-xl tracking-[-0.02em]">
        {release?.title ?? "Release notes"}
      </Dialog.Title>
      <Dialog.Description>
        {#if release}
          <span class="flex flex-wrap items-center gap-2">
            <Badge variant="outline" class="font-mono">{release.version}</Badge>
            <span>
              Published {formatReleaseDate(release.createdAt)}
              {#if release.createdByName}
                by {release.createdByName}
              {/if}
            </span>
          </span>
        {:else if loading}
          Loading…
        {/if}
      </Dialog.Description>
    </Dialog.Header>

    {#if release}
      <ReleaseMarkdown body={release.body} />
    {:else if loading}
      <div class="space-y-2">
        <Skeleton class="h-4 w-3/4" />
        <Skeleton class="h-4 w-full" />
        <Skeleton class="h-4 w-5/6" />
      </div>
    {/if}

    <Dialog.Footer>
      <Button onclick={() => (open = false)}>{dismissLabel}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
