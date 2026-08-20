<script lang="ts" module>
  /** One stored conversation as listed by GET /api/ai/chat. */
  export type ChatSession = {
    key: string;
    title: string;
    updatedAt: string | null;
  };
</script>

<script lang="ts">
  import * as AlertDialog from "$lib/components/ui/alert-dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";
  import { toast } from "svelte-sonner";

  interface Props {
    /** Backend agent the sessions belong to (scopes the DELETE call). */
    agentId: string;
    sessions: ChatSession[];
    /** Currently open session key, highlighted in the list. */
    activeKey: string;
    /** Blocks selecting and deleting while the parent chat is busy. */
    disabled?: boolean;
    onSelect: (key: string) => void;
    /** Called after a successful delete so the parent can refetch/reset. */
    onDeleted: (key: string) => Promise<void> | void;
  }

  let {
    agentId,
    sessions,
    activeKey,
    disabled = false,
    onSelect,
    onDeleted,
  }: Props = $props();

  let deleteTarget = $state<ChatSession | null>(null);
  let deleting = $state(false);

  async function confirmDelete() {
    const target = deleteTarget;

    if (!target || deleting) {
      return;
    }

    deleting = true;

    try {
      const response = await fetch(
        `/api/ai/chat?agentId=${encodeURIComponent(agentId)}&session=${encodeURIComponent(target.key)}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        throw new Error(`Delete failed with status ${response.status}`);
      }

      deleteTarget = null;
      await onDeleted(target.key);
    } catch {
      toast.error("Failed to delete the conversation. Please try again.");
    } finally {
      deleting = false;
    }
  }
</script>

{#if sessions.length === 0}
  <p class="text-muted-foreground px-3 py-2 text-sm">
    No previous conversations yet.
  </p>
{:else}
  {#each sessions as session (session.key)}
    <div
      class={[
        "group hover:bg-accent flex items-center rounded-md",
        session.key === activeKey ? "bg-accent" : "",
      ].join(" ")}
    >
      <button
        type="button"
        class="flex min-w-0 flex-1 flex-col gap-0.5 px-3 py-2 text-left"
        onclick={() => onSelect(session.key)}
      >
        <span class="truncate text-sm">{session.title}</span>
        {#if session.updatedAt}
          <span class="text-muted-foreground text-xs">
            {new Date(session.updatedAt).toLocaleString()}
          </span>
        {/if}
      </button>
      <Button
        variant="ghost"
        size="icon"
        class="text-muted-foreground hover:text-destructive mr-1 size-7 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        aria-label={`Delete conversation "${session.title}"`}
        disabled={disabled || deleting}
        onclick={() => (deleteTarget = session)}
      >
        <Trash2Icon class="size-3.5" />
      </Button>
    </div>
  {/each}
{/if}

<AlertDialog.Root
  open={deleteTarget !== null}
  onOpenChange={(open) => {
    if (!open && !deleting) {
      deleteTarget = null;
    }
  }}
>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Delete conversation?</AlertDialog.Title>
      <AlertDialog.Description>
        "{deleteTarget?.title}" will be permanently deleted. This cannot be
        undone.
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel disabled={deleting}>Cancel</AlertDialog.Cancel>
      <AlertDialog.Action
        variant="destructive"
        disabled={deleting}
        onclick={(event) => {
          // Keep the dialog open until the request settles.
          event.preventDefault();
          void confirmDelete();
        }}
      >
        Delete
      </AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
