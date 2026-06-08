<script lang="ts">
  import { enhance } from "$app/forms";
  import * as AlertDialog from "$lib/components/ui/alert-dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import BookmarkIcon from "@lucide/svelte/icons/bookmark";
  import BookmarkCheckIcon from "@lucide/svelte/icons/bookmark-check";

  let { entityId, isMonitored }: { entityId: string; isMonitored: boolean } =
    $props();

  let confirmOpen = $state(false);
</script>

{#if isMonitored}
  <AlertDialog.Root bind:open={confirmOpen}>
    <Tooltip.Provider>
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <Button
              {...props}
              type="button"
              variant="ghost"
              size="icon"
              class="size-8"
              aria-label="Remove from monitor list"
              onclick={() => (confirmOpen = true)}
            >
              <BookmarkCheckIcon class="fill-primary text-primary size-4" />
            </Button>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content>Monitoring — click to remove</Tooltip.Content>
      </Tooltip.Root>
    </Tooltip.Provider>

    <AlertDialog.Content>
      <AlertDialog.Header>
        <AlertDialog.Title>Remove from monitor list?</AlertDialog.Title>
        <AlertDialog.Description>
          This restaurant will no longer appear in your monitor list. You can
          add it back at any time.
        </AlertDialog.Description>
      </AlertDialog.Header>
      <AlertDialog.Footer>
        <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
        <form
          method="POST"
          action="?/removeMonitor"
          use:enhance={() => {
            return async ({ update }) => {
              await update();
              confirmOpen = false;
            };
          }}
        >
          <input type="hidden" name="entityId" value={entityId} />
          <Button type="submit" variant="destructive">Remove</Button>
        </form>
      </AlertDialog.Footer>
    </AlertDialog.Content>
  </AlertDialog.Root>
{:else}
  <form method="POST" action="?/addMonitor" use:enhance>
    <input type="hidden" name="entityId" value={entityId} />
    <Tooltip.Provider>
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <Button
              {...props}
              type="submit"
              variant="ghost"
              size="icon"
              class="size-8"
              aria-label="Add to monitor list"
            >
              <BookmarkIcon class="text-muted-foreground size-4" />
            </Button>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content>Add to monitor list</Tooltip.Content>
      </Tooltip.Root>
    </Tooltip.Provider>
  </form>
{/if}
