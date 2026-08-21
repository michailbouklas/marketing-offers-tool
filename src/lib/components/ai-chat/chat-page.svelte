<script lang="ts">
  import { Chat } from "@ai-sdk/svelte";
  import { DefaultChatTransport } from "ai";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import { Textarea } from "$lib/components/ui/textarea/index.js";
  import CopyMessageButton from "$lib/components/ai-chat/copy-message-button.svelte";
  import MessageTimestamp from "$lib/components/ai-chat/message-timestamp.svelte";
  import UserMessageActions from "$lib/components/ai-chat/user-message-actions.svelte";
  import {
    EXCEL_TOOL_PART_TYPE,
    excelErrorText,
    excelOutput,
  } from "$lib/components/ai-chat/excel-tool";
  import { renderMarkdown } from "$lib/components/ai-chat/markdown";
  import SessionList, {
    type ChatSession,
  } from "$lib/components/ai-chat/session-list.svelte";
  import ToolPart from "$lib/components/ai-chat/tool-part.svelte";
  import FileSpreadsheetIcon from "@lucide/svelte/icons/file-spreadsheet";
  import HistoryIcon from "@lucide/svelte/icons/history";
  import SendHorizontalIcon from "@lucide/svelte/icons/send-horizontal";
  import SparklesIcon from "@lucide/svelte/icons/sparkles";
  import SquarePenIcon from "@lucide/svelte/icons/square-pen";

  interface Props {
    /** Backend agent this page routes its messages to. */
    agentId: string;
    title?: string;
    /** Greeting shown before the first message. */
    greeting?: string;
    placeholder?: string;
  }

  let {
    agentId,
    title = "AI Assistant",
    greeting = "Hi! Ask me anything about this data.",
    placeholder = "Ask a question…",
  }: Props = $props();

  let input = $state("");
  let scrollContainer: HTMLDivElement | null = $state(null);
  let textareaRef: HTMLTextAreaElement | null = $state(null);
  let historyOpen = $state(false);
  let sessions = $state<ChatSession[]>([]);
  // Conversations are keyed client-side; the server namespaces the key per
  // agent + user, so a fresh key = a fresh thread while old ones stay stored.
  let sessionKey = $state<string>(crypto.randomUUID());

  const chat = new Chat({
    transport: new DefaultChatTransport({ api: "/api/ai/chat" }),
  });

  async function fetchSessions() {
    try {
      const response = await fetch(
        `/api/ai/chat?agentId=${encodeURIComponent(agentId)}`,
      );

      if (response.ok) {
        sessions = ((await response.json()) as { sessions: ChatSession[] })
          .sessions;
      }
    } catch {
      // Best effort — the sidebar just stays empty.
    }
  }

  // Recalls a stored conversation and renders it as-is.
  async function loadSession(key: string) {
    if (busy || key === sessionKey) {
      historyOpen = false;
      return;
    }

    try {
      const response = await fetch(
        `/api/ai/chat?agentId=${encodeURIComponent(agentId)}&session=${encodeURIComponent(key)}`,
      );

      if (!response.ok) {
        return;
      }

      const history = (await response.json()) as typeof chat.messages;
      sessionKey = key;
      chat.messages = history;
    } catch {
      // Best effort — keep the current conversation on failure.
    } finally {
      historyOpen = false;
    }
  }

  // Start a fresh thread. The previous conversation stays in the database and
  // remains recallable from the sidebar.
  function newConversation() {
    if (busy) {
      return;
    }

    sessionKey = crypto.randomUUID();
    chat.messages = [];
    historyOpen = false;
  }

  // After a delete: refresh the list, and if the open conversation was the
  // one removed, reset to a fresh thread (same as newConversation).
  async function handleDeleted(key: string) {
    if (key === sessionKey) {
      sessionKey = crypto.randomUUID();
      chat.messages = [];
    }

    await fetchSessions();
  }

  // The sidebar shows stored conversations from the start.
  $effect(() => {
    void fetchSessions();
  });

  const busy = $derived(
    chat.status === "submitted" || chat.status === "streaming",
  );

  // Titles are AI-generated shortly after the first exchange, so refresh the
  // list once each response finishes streaming.
  let wasBusy = false;
  $effect(() => {
    if (wasBusy && !busy) {
      void fetchSessions();
    }
    wasBusy = busy;
  });

  function handleSubmit(event?: SubmitEvent) {
    event?.preventDefault();
    const text = input.trim();

    if (!text || busy) {
      return;
    }

    // agentId/sessionKey ride along per request (instead of on the transport)
    // so they are read at send time, keeping them reactive.
    void chat.sendMessage({ text }, { body: { agentId, sessionKey } });
    input = "";
  }

  // Enter sends, Shift+Enter inserts a newline — same as Claude.
  function handleInputKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  }

  let editingMessageId = $state<string | null>(null);
  let editDraft = $state("");

  function messageText(message: (typeof chat.messages)[number]) {
    return message.parts
      .flatMap((part) => (part.type === "text" ? [part.text] : []))
      .join("\n\n");
  }

  // Re-asks from this user message: the conversation is truncated to just
  // before it and the same text is submitted again for a fresh answer.
  function retryMessage(messageIndex: number) {
    const text = messageText(chat.messages[messageIndex]);

    if (!text || busy) {
      return;
    }

    cancelEditing();
    chat.messages = chat.messages.slice(0, messageIndex);
    void chat.sendMessage({ text }, { body: { agentId, sessionKey } });
  }

  function startEditing(message: (typeof chat.messages)[number]) {
    if (busy) {
      return;
    }

    editingMessageId = message.id;
    editDraft = messageText(message);
  }

  function cancelEditing() {
    editingMessageId = null;
    editDraft = "";
  }

  // Sending an edit truncates the conversation from the edited message on and
  // submits the new text, so the answer is regenerated for the edited prompt.
  function submitEdit(messageIndex: number) {
    const text = editDraft.trim();

    if (!text || busy) {
      return;
    }

    chat.messages = chat.messages.slice(0, messageIndex);
    cancelEditing();
    void chat.sendMessage({ text }, { body: { agentId, sessionKey } });
  }

  function handleEditKeydown(event: KeyboardEvent, messageIndex: number) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitEdit(messageIndex);
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelEditing();
    }
  }

  // Grow the composer with its content (capped; scrolls beyond the cap).
  // Explicit height also covers browsers without `field-sizing: content`.
  $effect(() => {
    void input;

    if (textareaRef) {
      textareaRef.style.height = "auto";
      textareaRef.style.height = `${Math.min(textareaRef.scrollHeight, 200)}px`;
    }
  });

  // Keep the newest message in view while the answer streams in.
  $effect(() => {
    void chat.messages.at(-1)?.parts.length;
    void chat.status;

    if (scrollContainer) {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }
  });
</script>

{#snippet sessionList()}
  <SessionList
    {agentId}
    {sessions}
    activeKey={sessionKey}
    disabled={busy}
    onSelect={loadSession}
    onDeleted={handleDeleted}
  />
{/snippet}

<!-- Fills the viewport below the sticky h-14 top nav; all scrolling happens
  inside the conversation column so the page itself never scrolls. -->
<div class="flex h-[calc(100svh-3.5rem)] overflow-hidden">
  <!-- Previous-chats sidebar (desktop) -->
  <aside class="bg-muted/30 hidden w-64 shrink-0 flex-col border-r md:flex">
    <div class="p-3">
      <Button
        variant="outline"
        class="w-full justify-start gap-2"
        disabled={busy}
        onclick={newConversation}
      >
        <SquarePenIcon class="size-4" />
        New chat
      </Button>
    </div>
    <nav
      class="flex-1 space-y-0.5 overflow-y-auto overscroll-contain px-2 pb-3"
      aria-label="Previous conversations"
    >
      {@render sessionList()}
    </nav>
  </aside>

  <!-- Conversation column -->
  <div class="flex min-w-0 flex-1 flex-col">
    <!-- Mobile header: history + new chat (the sidebar is hidden below md) -->
    <div class="flex items-center gap-2 border-b px-4 py-2 md:hidden">
      <SparklesIcon class="text-primary size-4" />
      <span class="text-sm font-semibold">{title}</span>
      <div class="ml-auto flex items-center gap-1">
        <Popover.Root bind:open={historyOpen}>
          <Popover.Trigger>
            {#snippet child({ props })}
              <Button
                {...props}
                variant="ghost"
                size="icon"
                class="size-8"
                aria-label="Conversation history"
              >
                <HistoryIcon class="size-4" />
              </Button>
            {/snippet}
          </Popover.Trigger>
          <Popover.Content align="end" class="w-72 p-1">
            <div class="max-h-64 overflow-y-auto overscroll-contain">
              {@render sessionList()}
            </div>
          </Popover.Content>
        </Popover.Root>
        <Button
          variant="ghost"
          size="icon"
          class="size-8"
          aria-label="New conversation"
          disabled={busy}
          onclick={newConversation}
        >
          <SquarePenIcon class="size-4" />
        </Button>
      </div>
    </div>

    <div
      bind:this={scrollContainer}
      class="flex-1 overflow-y-auto overscroll-contain"
    >
      <div class="mx-auto w-full max-w-3xl space-y-6 px-4 py-6">
        {#if chat.messages.length === 0}
          <div
            class="text-muted-foreground flex h-full flex-col items-center justify-center gap-3 pt-24 text-center"
          >
            <SparklesIcon class="text-primary size-8" />
            <h1 class="text-foreground text-xl font-semibold">{title}</h1>
            <p class="max-w-md text-sm">{greeting}</p>
          </div>
        {/if}

        {#each chat.messages as message, messageIndex (message.id ?? messageIndex)}
          {#if message.role === "user"}
            {@const userText = messageText(message)}
            {#if editingMessageId === message.id}
              <div class="bg-muted/30 space-y-2 rounded-2xl border p-3">
                <Textarea
                  bind:value={editDraft}
                  class="min-h-16 resize-none text-sm"
                  aria-label="Edit message"
                  onkeydown={(event) => handleEditKeydown(event, messageIndex)}
                />
                <div class="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onclick={cancelEditing}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    disabled={!editDraft.trim() || busy}
                    onclick={() => submitEdit(messageIndex)}
                  >
                    Send
                  </Button>
                </div>
              </div>
            {:else}
              <div class="space-y-1">
                <div class="flex justify-end">
                  <div
                    class="bg-primary text-primary-foreground max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap"
                  >
                    {#each message.parts as part, partIndex (partIndex)}
                      {#if part.type === "text"}{part.text}{/if}
                    {/each}
                  </div>
                </div>
                <UserMessageActions
                  text={userText}
                  metadata={message.metadata}
                  disabled={busy}
                  onRetry={() => retryMessage(messageIndex)}
                  onEdit={() => startEditing(message)}
                />
              </div>
            {/if}
          {:else if message.role === "assistant"}
            {@const answerMarkdown = message.parts
              .flatMap((part) => (part.type === "text" ? [part.text] : []))
              .join("\n\n")}
            <div class="space-y-2">
              {#each message.parts as part, partIndex (partIndex)}
                {#if part.type === "text"}
                  <div
                    class="prose prose-sm dark:prose-invert prose-p:my-1.5 prose-table:my-2 prose-th:px-2 prose-td:px-2 max-w-none text-sm"
                  >
                    <!-- eslint-disable-next-line svelte/no-at-html-tags — sanitized in renderMarkdown -->
                    {@html renderMarkdown(part.text)}
                  </div>
                {:else if part.type === EXCEL_TOOL_PART_TYPE}
                  {@const output = excelOutput(part)}
                  {@const errorText = excelErrorText(part)}
                  {#if output?.ok}
                    <a
                      href={output.downloadUrl}
                      download={output.filename}
                      class="bg-muted hover:bg-accent inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium"
                    >
                      <FileSpreadsheetIcon class="text-primary size-3.5" />
                      {output.filename}
                    </a>
                  {:else if output || errorText}
                    <p class="text-destructive text-xs">
                      Excel export failed: {errorText ??
                        (output && !output.ok ? output.error : "unknown error")}
                    </p>
                  {:else}
                    <p
                      class="text-muted-foreground flex animate-pulse items-center gap-1.5 text-xs"
                    >
                      <FileSpreadsheetIcon class="size-3" />
                      Generating Excel…
                    </p>
                  {/if}
                {:else if part.type.startsWith("tool-") || part.type === "dynamic-tool"}
                  <ToolPart {part} />
                {/if}
              {/each}
              {#if answerMarkdown && !(messageIndex === chat.messages.length - 1 && busy)}
                <div class="flex items-center gap-1.5">
                  <CopyMessageButton text={answerMarkdown} />
                  <MessageTimestamp metadata={message.metadata} />
                </div>
              {/if}
            </div>
          {/if}
        {/each}

        {#if chat.status === "submitted"}
          <p class="text-muted-foreground animate-pulse text-sm">Thinking…</p>
        {/if}

        {#if chat.status === "error"}
          <p class="text-destructive text-sm">
            Something went wrong{chat.error?.message
              ? `: ${chat.error.message}`
              : ""}. Please try again.
          </p>
        {/if}
      </div>
    </div>

    <div class="border-t">
      <form
        class="mx-auto flex w-full max-w-3xl items-end gap-2 px-4 py-4"
        onsubmit={handleSubmit}
      >
        <Textarea
          bind:ref={textareaRef}
          bind:value={input}
          {placeholder}
          rows={1}
          autocomplete="off"
          class="max-h-52 min-h-10 flex-1 resize-none overflow-y-auto"
          onkeydown={handleInputKeydown}
        />
        <Button
          type="submit"
          size="icon"
          aria-label="Send message"
          disabled={busy || input.trim().length === 0}
        >
          <SendHorizontalIcon class="size-4" />
        </Button>
      </form>
    </div>
  </div>
</div>
