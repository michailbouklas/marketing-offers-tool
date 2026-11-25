<script lang="ts">
  import ThumbsDownIcon from "@lucide/svelte/icons/thumbs-down";
  import ThumbsUpIcon from "@lucide/svelte/icons/thumbs-up";
  import { toast } from "svelte-sonner";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import { Textarea } from "$lib/components/ui/textarea/index.js";

  interface Props {
    agentId: string;
    sessionKey: string;
    /** Stored id of the rated assistant message. */
    messageId: string;
  }

  let { agentId, sessionKey, messageId }: Props = $props();

  // shortcut: the rating is remembered for this page visit only; load the
  // user's ratings with the conversation if it should survive a reload.
  let rating = $state<1 | -1 | null>(null);
  let reason = $state("");
  let reasonOpen = $state(false);
  let sending = $state(false);

  async function rate(value: 1 | -1) {
    sending = true;
    try {
      const response = await fetch("/api/ai/chat/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          agentId,
          sessionKey,
          messageId,
          rating: value,
          // A reason only explains a thumbs down.
          ...(value === -1 && reason.trim() ? { reason: reason.trim() } : {}),
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      rating = value;
      reasonOpen = false;
    } catch {
      toast.error("Could not save your feedback.");
    } finally {
      sending = false;
    }
  }
</script>

<Button
  type="button"
  variant="ghost"
  size="icon-sm"
  class={rating === 1
    ? "text-primary"
    : "text-muted-foreground hover:text-foreground"}
  aria-label="Good answer"
  aria-pressed={rating === 1}
  title="Good answer"
  disabled={sending}
  onclick={() => rate(1)}
>
  <ThumbsUpIcon class={["size-3.5", rating === 1 && "fill-current"]} />
</Button>

<Popover.Root bind:open={reasonOpen}>
  <Popover.Trigger>
    {#snippet child({ props })}
      <Button
        {...props}
        type="button"
        variant="ghost"
        size="icon-sm"
        class={rating === -1
          ? "text-destructive"
          : "text-muted-foreground hover:text-foreground"}
        aria-label="Bad answer"
        aria-pressed={rating === -1}
        title="Bad answer"
      >
        <ThumbsDownIcon class={["size-3.5", rating === -1 && "fill-current"]} />
      </Button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content align="start">
    <Textarea
      bind:value={reason}
      maxlength={2000}
      rows={3}
      class="resize-none text-sm"
      aria-label="What was wrong with this answer? (optional)"
      placeholder="What was wrong? (optional)"
    />
    <Button
      type="button"
      size="sm"
      class="self-end"
      disabled={sending}
      onclick={() => rate(-1)}
    >
      Send
    </Button>
  </Popover.Content>
</Popover.Root>
