<script lang="ts">
  import CheckIcon from "@lucide/svelte/icons/check";
  import CopyIcon from "@lucide/svelte/icons/copy";
  import { toast } from "svelte-sonner";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";

  let { text }: { text: string } = $props();

  let copied = $state(false);
  let resetTimer: ReturnType<typeof setTimeout> | undefined;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
      clearTimeout(resetTimer);
      resetTimer = setTimeout(() => {
        copied = false;
      }, 2000);
    } catch {
      toast.error("Could not copy to clipboard.");
    }
  }
</script>

<Tooltip.Provider>
  <Tooltip.Root>
    <Tooltip.Trigger>
      {#snippet child({ props })}
        <Button
          {...props}
          type="button"
          variant="ghost"
          size="icon-sm"
          class="text-muted-foreground hover:text-foreground"
          aria-label="Copy message as markdown"
          onclick={copy}
        >
          {#if copied}
            <CheckIcon class="size-3.5" />
          {:else}
            <CopyIcon class="size-3.5" />
          {/if}
        </Button>
      {/snippet}
    </Tooltip.Trigger>
    <Tooltip.Content>{copied ? "Copied" : "Copy"}</Tooltip.Content>
  </Tooltip.Root>
</Tooltip.Provider>
