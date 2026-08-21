<script lang="ts">
  import PencilIcon from "@lucide/svelte/icons/pencil";
  import RotateCwIcon from "@lucide/svelte/icons/rotate-cw";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import CopyMessageButton from "$lib/components/ai-chat/copy-message-button.svelte";
  import MessageTimestamp from "$lib/components/ai-chat/message-timestamp.svelte";

  let {
    text,
    metadata,
    disabled = false,
    onRetry,
    onEdit,
  }: {
    text: string;
    metadata?: unknown;
    disabled?: boolean;
    onRetry: () => void;
    onEdit: () => void;
  } = $props();
</script>

<div class="flex items-center justify-end gap-1">
  <MessageTimestamp {metadata} />
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
            aria-label="Retry message"
            {disabled}
            onclick={onRetry}
          >
            <RotateCwIcon class="size-3.5" />
          </Button>
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Content>Retry</Tooltip.Content>
    </Tooltip.Root>
    <Tooltip.Root>
      <Tooltip.Trigger>
        {#snippet child({ props })}
          <Button
            {...props}
            type="button"
            variant="ghost"
            size="icon-sm"
            class="text-muted-foreground hover:text-foreground"
            aria-label="Edit message"
            {disabled}
            onclick={onEdit}
          >
            <PencilIcon class="size-3.5" />
          </Button>
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Content>Edit</Tooltip.Content>
    </Tooltip.Root>
  </Tooltip.Provider>
  <CopyMessageButton {text} />
</div>
