<script lang="ts">
  import { toast } from "svelte-sonner";
  import { invalidate } from "$app/navigation";
  import { page } from "$app/state";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { buttonVariants } from "$lib/components/ui/button/index.js";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import SparklesIcon from "@lucide/svelte/icons/sparkles";
  import { cn } from "$lib/utils.js";
  import {
    EMPTY_RELEASE_INBOX,
    RELEASE_READ_URL,
    RELEASES_DEPENDENCY,
    formatReleaseDate,
    releaseDetailUrl,
    type ReleaseDetail,
    type ReleaseInbox,
  } from "$lib/services/releases/releases";
  import { releaseEvents } from "$lib/state/release-events.svelte";
  import ReleaseDialog from "./release-dialog.svelte";

  /**
   * Header button: unread dot + popover listing every release. Opening one
   * loads its body on demand and marks that release read.
   */
  const inbox = $derived(
    (page.data.releaseInbox as ReleaseInbox | undefined) ?? EMPTY_RELEASE_INBOX,
  );
  const knownIds = $derived(new Set(inbox.items.map((item) => item.id)));
  // Publishes announced over SSE that the layout has not re-fetched yet still
  // light the dot (the store already triggered the invalidate).
  const liveUnread = $derived(
    releaseEvents.liveReleaseIds.filter((id) => !knownIds.has(id)).length,
  );
  const unreadCount = $derived(inbox.unreadCount + liveUnread);

  let menuOpen = $state(false);
  let detailOpen = $state(false);
  let selected = $state<ReleaseDetail | null>(null);
  let loading = $state(false);
  const cache = new Map<number, ReleaseDetail>();

  async function openRelease(id: number, alreadyRead: boolean) {
    menuOpen = false;
    selected = cache.get(id) ?? null;
    loading = selected === null;
    detailOpen = true;

    try {
      if (!selected) {
        const res = await fetch(releaseDetailUrl(id));
        if (!res.ok) {
          throw new Error(`Failed to load release ${id} (${res.status}).`);
        }
        const detail = (await res.json()) as ReleaseDetail;
        cache.set(id, detail);
        selected = detail;
      }
      if (!alreadyRead) {
        await fetch(RELEASE_READ_URL, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ releaseId: id }),
        });
        await invalidate(RELEASES_DEPENDENCY);
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not load the release.",
      );
      detailOpen = false;
    } finally {
      loading = false;
    }
  }

  const label = $derived(
    unreadCount > 0 ? `Release notes, ${unreadCount} unread` : "Release notes",
  );
</script>

<Popover.Root bind:open={menuOpen}>
  <Popover.Trigger
    class={cn(buttonVariants({ variant: "ghost", size: "icon" }), "relative")}
    aria-label={label}
    title="What's new"
  >
    <SparklesIcon class="size-5" />
    {#if unreadCount > 0}
      <span
        class="bg-primary ring-background absolute top-1.5 right-1.5 size-2 rounded-full ring-2"
        aria-hidden="true"
      ></span>
    {/if}
  </Popover.Trigger>
  <Popover.Content align="end" class="w-80 p-0">
    <div class="border-border/70 border-b px-4 py-3">
      <p class="text-sm font-semibold">What's new</p>
      <p class="text-muted-foreground text-xs">
        {#if inbox.items.length === 0}
          No releases published yet.
        {:else if unreadCount > 0}
          {unreadCount} unread {unreadCount === 1 ? "release" : "releases"}
        {:else}
          You're up to date.
        {/if}
      </p>
    </div>
    {#if inbox.items.length > 0}
      <ul class="max-h-80 overflow-y-auto py-1">
        {#each inbox.items as item (item.id)}
          <li>
            <button
              type="button"
              class="hover:bg-muted/70 focus-visible:bg-muted/70 flex w-full items-start gap-3 px-4 py-2 text-left outline-none"
              onclick={() => openRelease(item.id, item.read)}
            >
              <span
                class="mt-1.5 size-2 shrink-0 rounded-full {item.read
                  ? 'bg-transparent'
                  : 'bg-primary'}"
                aria-hidden="true"
              ></span>
              <span class="min-w-0 flex-1">
                <span
                  class="block truncate text-sm {item.read
                    ? 'font-normal'
                    : 'font-semibold'}"
                >
                  {item.title}
                </span>
                <span
                  class="text-muted-foreground flex items-center gap-2 text-xs"
                >
                  <Badge variant="outline" class="font-mono text-[10px]">
                    {item.version}
                  </Badge>
                  {formatReleaseDate(item.createdAt)}
                </span>
              </span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </Popover.Content>
</Popover.Root>

<ReleaseDialog release={selected} bind:open={detailOpen} {loading} />
