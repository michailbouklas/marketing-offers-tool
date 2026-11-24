<script lang="ts">
  import * as Command from "$lib/components/ui/command/index.js";
  import { typedTextOf } from "$lib/components/ai-chat/attachments";
  import { renderMarkdown } from "$lib/components/ai-chat/markdown";
  import type { ChatSession } from "$lib/components/ai-chat/session-list.svelte";
  import CornerDownLeftIcon from "@lucide/svelte/icons/corner-down-left";
  import MessageCircleIcon from "@lucide/svelte/icons/message-circle";

  interface Props {
    open: boolean;
    /** Backend agent whose conversations are searched. */
    agentId: string;
    /** All stored conversations, shown while the search box is empty. */
    sessions: ChatSession[];
    /** Sessions open as tabs, each marked with a dot. */
    openKeys: string[];
    /** Called with the chosen session key; the dialog closes itself. */
    onOpen: (key: string) => void;
  }

  let {
    open = $bindable(false),
    agentId,
    sessions,
    openKeys,
    onOpen,
  }: Props = $props();

  type PreviewMessage = {
    id?: string;
    role: string;
    parts: { type: string; text?: string }[];
  };

  let query = $state("");
  /** Key of the highlighted result (the Command root's selected value). */
  let highlighted = $state("");
  /** Server matches for the current query; null until the first answer. */
  let results = $state.raw<ChatSession[] | null>(null);
  let preview = $state.raw<{ key: string; messages: PreviewMessage[] } | null>(
    null,
  );

  const searching = $derived(query.trim().length > 0);
  const shown = $derived(searching ? (results ?? []) : sessions);
  const highlightedSession = $derived(
    shown.find((session) => session.key === highlighted),
  );

  const api = $derived(`/api/ai/chat?agentId=${encodeURIComponent(agentId)}`);

  // Each open starts clean.
  $effect(() => {
    if (!open) {
      query = "";
      results = null;
    }
  });

  // Titles and message text are matched server-side (debounced); a late
  // answer for an older query is dropped.
  $effect(() => {
    const text = query.trim();

    if (!open || !text) {
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`${api}&q=${encodeURIComponent(text)}`);

        if (response.ok && text === query.trim()) {
          results = ((await response.json()) as { sessions: ChatSession[] })
            .sessions;
        }
      } catch {
        // Best effort — the previous results stay.
      }
    }, 200);

    return () => clearTimeout(timer);
  });

  // Preview follows the highlight (debounced so arrowing through is cheap).
  $effect(() => {
    const key = highlightedSession?.key;

    if (!open || !key || preview?.key === key) {
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `${api}&session=${encodeURIComponent(key)}`,
        );

        if (response.ok && key === highlighted) {
          preview = {
            key,
            messages: (await response.json()) as PreviewMessage[],
          };
        }
      } catch {
        // Best effort — the pane keeps saying "Loading…".
      }
    }, 150);

    return () => clearTimeout(timer);
  });

  function choose(key: string) {
    open = false;
    onOpen(key);
  }
</script>

<Command.Dialog
  bind:open
  bind:value={highlighted}
  shouldFilter={false}
  title="Search chats"
  description="Search your previous conversations by title or message text"
  class="top-[12vh] h-[72vh] sm:max-w-5xl"
>
  <Command.Input bind:value={query} placeholder="Search chats…" />

  <div class="mt-1 flex min-h-0 flex-1 border-t">
    <div class="flex min-w-0 flex-1 flex-col">
      <p
        class="text-muted-foreground flex justify-between px-3 pt-3 pb-1.5 text-xs font-medium"
      >
        <span>{searching ? "Results" : "Recent"}</span>
        <span>{shown.length}</span>
      </p>
      <Command.List class="max-h-none flex-1 px-1 pb-1">
        {#if shown.length === 0}
          <p class="text-muted-foreground px-2 py-6 text-center text-sm">
            {#if !searching}
              No previous conversations yet.
            {:else if results === null}
              Searching…
            {:else}
              No matching chats.
            {/if}
          </p>
        {/if}
        {#each shown as session (session.key)}
          <Command.Item
            value={session.key}
            class="gap-2.5 py-2 [&>.cn-command-item-indicator]:hidden"
            onSelect={() => choose(session.key)}
          >
            <MessageCircleIcon class="text-muted-foreground size-4" />
            <span class="truncate font-medium">{session.title}</span>
            {#if openKeys.includes(session.key)}
              <span
                class="bg-primary size-1.5 shrink-0 rounded-full"
                role="img"
                aria-label="Open in a tab"
              ></span>
            {/if}
            {#if session.updatedAt}
              <span class="text-muted-foreground ml-auto shrink-0 text-xs">
                {new Date(session.updatedAt).toLocaleDateString()}
              </span>
            {/if}
          </Command.Item>
        {/each}
      </Command.List>
    </div>

    <!-- Read-only preview of the highlighted conversation (text only). -->
    <div class="hidden min-w-0 flex-1 flex-col border-l md:flex">
      {#if highlightedSession}
        <p class="truncate px-4 pt-3 pb-2 text-sm font-semibold">
          {highlightedSession.title}
        </p>
        <div class="flex-1 space-y-4 overflow-y-auto px-4 pb-4">
          {#if preview?.key !== highlightedSession.key}
            <p class="text-muted-foreground animate-pulse text-sm">Loading…</p>
          {:else}
            {#each preview.messages as message, index (message.id ?? index)}
              {#if message.role === "user"}
                {@const text = typedTextOf(message.parts)}
                {#if text}
                  <div class="flex justify-end">
                    <div
                      class="bg-muted max-w-[85%] rounded-2xl px-3 py-1.5 text-sm whitespace-pre-wrap"
                    >
                      {text}
                    </div>
                  </div>
                {/if}
              {:else if message.role === "assistant"}
                {#each message.parts as part, partIndex (partIndex)}
                  {#if part.type === "text" && part.text}
                    <div
                      class="prose prose-sm dark:prose-invert prose-p:my-1.5 prose-table:my-2 prose-th:px-2 prose-td:px-2 max-w-none text-sm"
                    >
                      <!-- eslint-disable-next-line svelte/no-at-html-tags — sanitized in renderMarkdown -->
                      {@html renderMarkdown(part.text)}
                    </div>
                  {/if}
                {/each}
              {/if}
            {/each}
          {/if}
        </div>
      {:else}
        <p class="text-muted-foreground m-auto text-sm">
          Select a chat to preview it.
        </p>
      {/if}
    </div>
  </div>

  <div
    class="text-muted-foreground flex items-center justify-between border-t px-3 py-2 text-xs"
  >
    <span>Searches titles and message text</span>
    <span class="flex items-center gap-1">
      Open <CornerDownLeftIcon class="size-3" />
    </span>
  </div>
</Command.Dialog>
