<script lang="ts" module>
  /** One stored conversation as listed by GET /api/ai/chat. */
  export type ChatSession = {
    key: string;
    title: string;
    updatedAt: string | null;
    pinned?: boolean;
  };
</script>

<script lang="ts">
  import * as AlertDialog from "$lib/components/ui/alert-dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { UNSHAREABLE_AGENT_IDS } from "$lib/components/ai-chat/chat-share";
  import { groupSessions } from "$lib/components/ai-chat/session-groups";
  import ShareDialog from "$lib/components/ai-chat/share-dialog.svelte";
  import EllipsisIcon from "@lucide/svelte/icons/ellipsis";
  import PencilIcon from "@lucide/svelte/icons/pencil";
  import PinIcon from "@lucide/svelte/icons/pin";
  import PinOffIcon from "@lucide/svelte/icons/pin-off";
  import Share2Icon from "@lucide/svelte/icons/share-2";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";
  import { toast } from "svelte-sonner";

  interface Props {
    /** Backend agent the sessions belong to (scopes the DELETE/PATCH calls). */
    agentId: string;
    sessions: ChatSession[];
    /** Currently open session key, highlighted in the list. */
    activeKey: string;
    /** Sessions open as tabs, each marked with a dot (tabbed chat page only). */
    openKeys?: string[];
    /** Blocks selecting, editing and deleting while the parent chat is busy. */
    disabled?: boolean;
    onSelect: (key: string) => void;
    /** Called after a successful delete so the parent can refetch/reset. */
    onDeleted: (key: string) => Promise<void> | void;
    /** Called after a rename or pin so the parent can refetch. */
    onChanged?: () => Promise<void> | void;
  }

  let {
    agentId,
    sessions,
    activeKey,
    openKeys = [],
    disabled = false,
    onSelect,
    onDeleted,
    onChanged,
  }: Props = $props();

  let deleteTarget = $state<ChatSession | null>(null);
  let deleting = $state(false);
  let renameTarget = $state<ChatSession | null>(null);
  let renameTitle = $state("");
  let saving = $state(false);
  let shareTarget = $state<ChatSession | null>(null);
  // Renames and pins saved here, shown at once even when the parent does not
  // refetch (the chat widget passes no onChanged).
  let saved = $state<Record<string, Partial<ChatSession>>>({});

  const groups = $derived(
    groupSessions(
      sessions.map((session) => ({ ...session, ...saved[session.key] })),
    ),
  );

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

  // Renames or pins one conversation; resolves true when the server saved it.
  async function updateSession(
    key: string,
    change: { title?: string; pinned?: boolean },
  ) {
    if (saving) {
      return false;
    }

    saving = true;

    try {
      const response = await fetch("/api/ai/chat/session", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, session: key, ...change }),
      });

      if (!response.ok) {
        throw new Error(`Update failed with status ${response.status}`);
      }

      const { title, pinned } = (await response.json()) as ChatSession;
      saved[key] = { title, pinned };
      await onChanged?.();

      return true;
    } catch {
      toast.error("Failed to update the conversation. Please try again.");

      return false;
    } finally {
      saving = false;
    }
  }

  async function confirmRename(event: SubmitEvent) {
    event.preventDefault();
    const title = renameTitle.trim();

    if (
      renameTarget &&
      title &&
      (await updateSession(renameTarget.key, { title }))
    ) {
      renameTarget = null;
    }
  }
</script>

{#if sessions.length === 0}
  <p class="text-muted-foreground px-3 py-2 text-sm">
    No previous conversations yet.
  </p>
{:else}
  {#each groups as group (group.label)}
    <p class="text-muted-foreground px-3 pt-3 pb-1 text-xs font-medium">
      {group.label}
    </p>
    {#each group.sessions as session (session.key)}
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
          <span class="flex items-center gap-1.5">
            {#if openKeys.includes(session.key)}
              <span
                class="bg-primary size-1.5 shrink-0 rounded-full"
                role="img"
                aria-label="Open in a tab"
              ></span>
            {/if}
            <span class="truncate text-sm">{session.title}</span>
          </span>
          {#if session.updatedAt}
            <span class="text-muted-foreground text-xs">
              {new Date(session.updatedAt).toLocaleString()}
            </span>
          {/if}
        </button>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            {#snippet child({ props })}
              <Button
                {...props}
                variant="ghost"
                size="icon"
                class="text-muted-foreground size-7 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                aria-label={`Actions for conversation "${session.title}"`}
                disabled={disabled || saving}
              >
                <EllipsisIcon class="size-3.5" />
              </Button>
            {/snippet}
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="end">
            <DropdownMenu.Item
              onSelect={() => {
                renameTitle = session.title;
                renameTarget = session;
              }}
            >
              <PencilIcon class="size-3.5" />
              Rename
            </DropdownMenu.Item>
            <DropdownMenu.Item
              onSelect={() =>
                void updateSession(session.key, { pinned: !session.pinned })}
            >
              {#if session.pinned}
                <PinOffIcon class="size-3.5" />
                Unpin
              {:else}
                <PinIcon class="size-3.5" />
                Pin
              {/if}
            </DropdownMenu.Item>
            {#if !UNSHAREABLE_AGENT_IDS.includes(agentId)}
              <DropdownMenu.Item onSelect={() => (shareTarget = session)}>
                <Share2Icon class="size-3.5" />
                Share
              </DropdownMenu.Item>
            {/if}
          </DropdownMenu.Content>
        </DropdownMenu.Root>
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
  {/each}
{/if}

{#if shareTarget}
  <ShareDialog
    {agentId}
    sessionKey={shareTarget.key}
    title={shareTarget.title}
    onClose={() => (shareTarget = null)}
  />
{/if}

<Dialog.Root
  open={renameTarget !== null}
  onOpenChange={(open) => {
    if (!open && !saving) {
      renameTarget = null;
    }
  }}
>
  <Dialog.Content class="sm:max-w-md">
    <form class="grid gap-4" onsubmit={confirmRename}>
      <Dialog.Header>
        <Dialog.Title>Rename conversation</Dialog.Title>
      </Dialog.Header>
      <Input
        bind:value={renameTitle}
        aria-label="Conversation title"
        maxlength={200}
        required
      />
      <Dialog.Footer>
        <Button
          type="button"
          variant="outline"
          disabled={saving}
          onclick={() => (renameTarget = null)}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={saving || !renameTitle.trim()}>
          Save
        </Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>

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
