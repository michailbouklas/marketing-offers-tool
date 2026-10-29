<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { invalidate } from "$app/navigation";
  import { page } from "$app/state";
  import {
    RELEASE_READ_URL,
    RELEASES_DEPENDENCY,
    type ReleaseInbox,
  } from "$lib/services/releases/releases";
  import ReleaseDialog from "./release-dialog.svelte";

  /**
   * "What's new" shown once per sign-in / full load while there is an unread
   * release. The newest unread is captured ONCE at init: a later layout
   * refresh (e.g. the SSE `invalidate` after a publish) must not pop the
   * dialog mid-session — the toast + Refresh path covers that, and the next
   * full load shows the dialog. Dismissing marks every unread release read.
   */
  const release = untrack(
    () =>
      (page.data.releaseInbox as ReleaseInbox | undefined)?.newestUnread ??
      null,
  );

  // Opened client-side only, so the markdown is never server-rendered.
  let open = $state(false);
  onMount(() => {
    if (release) {
      open = true;
    }
  });

  async function dismiss() {
    try {
      await fetch(RELEASE_READ_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
    } catch {
      // Best effort: the next full load re-prompts if this did not persist.
    }
    await invalidate(RELEASES_DEPENDENCY);
  }
</script>

{#if release}
  <ReleaseDialog
    {release}
    bind:open
    dismissLabel="Got it"
    onDismiss={dismiss}
  />
{/if}
