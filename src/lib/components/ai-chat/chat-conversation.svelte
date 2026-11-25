<script lang="ts">
  import type { Chat } from "@ai-sdk/svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Textarea } from "$lib/components/ui/textarea/index.js";
  import CopyMessageButton from "$lib/components/ai-chat/copy-message-button.svelte";
  import MessageTimestamp from "$lib/components/ai-chat/message-timestamp.svelte";
  import StarterPrompts from "$lib/components/ai-chat/starter-prompts.svelte";
  import UserMessageActions from "$lib/components/ai-chat/user-message-actions.svelte";
  import {
    EXCEL_TOOL_PART_TYPE,
    excelErrorText,
    excelOutput,
  } from "$lib/components/ai-chat/excel-tool";
  import {
    THREEJS_REPORT_TOOL_PART_TYPE,
    threeJsReportErrorText,
    threeJsReportOutput,
  } from "$lib/components/ai-chat/threejs-report-tool";
  import { renderMarkdown } from "$lib/components/ai-chat/markdown";
  import ToolPart from "$lib/components/ai-chat/tool-part.svelte";
  import AttachmentComposer from "$lib/components/ai-chat/attachment-composer.svelte";
  import MessageAttachments from "$lib/components/ai-chat/message-attachments.svelte";
  import {
    attachmentPartsOf,
    parseAttachmentText,
    toMessageParts,
    typedTextOf,
  } from "$lib/components/ai-chat/attachments";
  import { toast } from "svelte-sonner";
  import { onDestroy } from "svelte";
  import ChartColumnIcon from "@lucide/svelte/icons/chart-column";
  import DownloadIcon from "@lucide/svelte/icons/download";
  import FileSpreadsheetIcon from "@lucide/svelte/icons/file-spreadsheet";
  import SendHorizontalIcon from "@lucide/svelte/icons/send-horizontal";
  import SparklesIcon from "@lucide/svelte/icons/sparkles";

  interface Props {
    /** This tab's conversation; owned by the parent so it outlives tab switches. */
    chat: Chat;
    /** Backend agent the messages are routed to. */
    agentId: string;
    /** Server-side thread key of this conversation. */
    sessionKey: string;
    title: string;
    /** Greeting shown before the first message. */
    greeting: string;
    placeholder: string;
    /** Optional page state sent with every message as `context` (see ChatWidget). */
    context?: Record<string, unknown>;
    /** Whether this tab is the visible one; hidden panels cannot be measured. */
    active: boolean;
    /** Called when a response finishes streaming (titles are generated then). */
    onSettled: () => void;
  }

  let {
    chat,
    agentId,
    sessionKey,
    title,
    greeting,
    placeholder,
    context,
    active,
    onSettled,
  }: Props = $props();

  let input = $state("");
  let scrollContainer: HTMLDivElement | null = $state(null);
  let textareaRef: HTMLTextAreaElement | null = $state(null);

  const busy = $derived(
    chat.status === "submitted" || chat.status === "streaming",
  );

  // Titles are AI-generated shortly after the first exchange, so the parent
  // refreshes its list once each response finishes streaming.
  let wasBusy = false;
  $effect(() => {
    if (wasBusy && !busy) {
      onSettled();
      if (chat.status === "ready") {
        followUpTimer = setTimeout(loadFollowUps, 1000);
      }
    } else if (busy) {
      clearTimeout(followUpTimer);
      followUps = [];
    }
    wasBusy = busy;
  });

  // Suggested next questions for the answer that just finished; shown under it.
  let followUps = $state<string[]>([]);
  let followUpTimer: ReturnType<typeof setTimeout> | undefined;
  onDestroy(() => clearTimeout(followUpTimer));

  async function loadFollowUps() {
    const answer = chat.messages.at(-1);
    const question = chat.messages.findLast((m) => m.role === "user");
    if (answer?.role !== "assistant" || !question) return;

    const answerText = answer.parts
      .flatMap((part) => (part.type === "text" ? [part.text] : []))
      .join("\n\n")
      .trim();
    const questionText = messageText(question).trim();
    if (!answerText || !questionText) return;

    try {
      const response = await fetch("/api/ai/chat/follow-ups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          agentId,
          question: questionText.slice(0, 2000),
          // The end of an answer carries its conclusion.
          answer: answerText.slice(-4000),
        }),
      });
      if (!response.ok) return;
      const { suggestions } = (await response.json()) as {
        suggestions: string[];
      };
      // Drop the result if the conversation moved on while it loaded.
      if (!busy && chat.messages.at(-1) === answer) followUps = suggestions;
    } catch {
      // Suggestions are optional; the chat works without them.
    }
  }

  let pendingFiles = $state<File[]>([]);
  let preparingFiles = $state(false);

  // Attachments go first, then the typed text (if any) — same as Claude.
  function send(parts: (typeof chat.messages)[number]["parts"], text: string) {
    // agentId/sessionKey ride along per request (instead of on the transport)
    // so they are read at send time, keeping them reactive.
    void chat.sendMessage(
      { parts: [...parts, ...(text ? [{ type: "text" as const, text }] : [])] },
      { body: { agentId, sessionKey, ...(context ? { context } : {}) } },
    );
  }

  async function handleSubmit(event?: SubmitEvent) {
    event?.preventDefault();
    const text = input.trim();

    if ((!text && pendingFiles.length === 0) || busy || preparingFiles) {
      return;
    }

    preparingFiles = true;
    try {
      send(await toMessageParts(pendingFiles), text);
      input = "";
      pendingFiles = [];
    } catch (cause) {
      toast.error(
        `Could not read the attachment: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    } finally {
      preparingFiles = false;
    }
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

  // Typed text only — converted attachments render as chips, not text.
  function messageText(message: (typeof chat.messages)[number]) {
    return typedTextOf(message.parts);
  }

  // Re-asks from this user message: the conversation is truncated to just
  // before it and the same text + attachments are submitted again.
  function retryMessage(messageIndex: number) {
    const message = chat.messages[messageIndex];
    const text = messageText(message);
    const attachments = attachmentPartsOf(message.parts);

    if ((!text && attachments.length === 0) || busy) {
      return;
    }

    cancelEditing();
    chat.messages = chat.messages.slice(0, messageIndex);
    send(attachments, text);
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
    // The edited message keeps its attachments.
    const attachments = attachmentPartsOf(chat.messages[messageIndex].parts);

    if ((!text && attachments.length === 0) || busy) {
      return;
    }

    chat.messages = chat.messages.slice(0, messageIndex);
    cancelEditing();
    send(attachments, text);
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
  // Re-runs on `active`: a hidden tab measures as zero height.
  $effect(() => {
    void input;
    void active;

    if (textareaRef) {
      textareaRef.style.height = "auto";
      textareaRef.style.height = `${Math.min(textareaRef.scrollHeight, 200)}px`;
    }
  });

  // Keep the newest message in view while the answer streams in, and when
  // the tab comes back into view after streaming in the background.
  $effect(() => {
    void chat.messages.at(-1)?.parts.length;
    void chat.status;
    void active;
    void followUps.length;

    if (scrollContainer) {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }
  });
</script>

<div
  bind:this={scrollContainer}
  class="min-h-0 flex-1 overflow-y-auto overscroll-contain"
>
  <div class="mx-auto w-full max-w-3xl space-y-6 px-4 py-6">
    {#if chat.messages.length === 0}
      <div
        class="text-muted-foreground flex h-full flex-col items-center justify-center gap-3 pt-24 text-center"
      >
        <SparklesIcon class="text-primary size-8" />
        <h1 class="text-foreground text-xl font-semibold">{title}</h1>
        <p class="max-w-md text-sm">{greeting}</p>
        <StarterPrompts {agentId} onPick={(text) => send([], text)} />
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
                disabled={(!editDraft.trim() &&
                  attachmentPartsOf(message.parts).length === 0) ||
                  busy}
                onclick={() => submitEdit(messageIndex)}
              >
                Send
              </Button>
            </div>
          </div>
        {:else}
          <div class="space-y-1">
            <MessageAttachments parts={message.parts} {agentId} {sessionKey} />
            {#if userText}
              <div class="flex justify-end">
                <div
                  class="bg-primary text-primary-foreground max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap"
                >
                  {#each message.parts as part, partIndex (partIndex)}
                    {#if part.type === "text" && !parseAttachmentText(part.text)}{part.text}{/if}
                  {/each}
                </div>
              </div>
            {/if}
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
            {:else if part.type === THREEJS_REPORT_TOOL_PART_TYPE}
              {@const report = threeJsReportOutput(part)}
              {@const reportError = threeJsReportErrorText(part)}
              {#if report?.ok}
                <span class="inline-flex items-center gap-1">
                  <a
                    href={report.openUrl}
                    target="_blank"
                    rel="noopener"
                    title="Open the interactive 3D report in a new tab"
                    class="bg-muted hover:bg-accent inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium"
                  >
                    <ChartColumnIcon class="text-primary size-3.5" />
                    {report.filename}
                  </a>
                  <a
                    href={report.downloadUrl}
                    download={report.filename}
                    aria-label="Download report"
                    title="Download report"
                    class="bg-muted hover:bg-accent inline-flex items-center rounded-md border p-1.5"
                  >
                    <DownloadIcon class="size-3.5" />
                  </a>
                </span>
              {:else if report || reportError}
                <p class="text-destructive text-xs">
                  3D report failed: {reportError ??
                    (report && !report.ok ? report.error : "unknown error")}
                </p>
              {:else}
                <p
                  class="text-muted-foreground flex animate-pulse items-center gap-1.5 text-xs"
                >
                  <ChartColumnIcon class="size-3" />
                  Building 3D report…
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
          {#if messageIndex === chat.messages.length - 1 && followUps.length > 0}
            <div class="pt-4">
              <p class="text-sm font-medium">Follow up</p>
              <ul class="divide-y">
                {#each followUps as followUp (followUp)}
                  <li>
                    <button
                      type="button"
                      class="text-muted-foreground hover:text-foreground w-full cursor-pointer py-2.5 text-left text-sm"
                      onclick={() => send([], followUp)}
                    >
                      {followUp}
                    </button>
                  </li>
                {/each}
              </ul>
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
  <form class="mx-auto w-full max-w-3xl px-4 py-4" onsubmit={handleSubmit}>
    <AttachmentComposer
      bind:files={pendingFiles}
      disabled={busy || preparingFiles}
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
        disabled={busy ||
          preparingFiles ||
          (input.trim().length === 0 && pendingFiles.length === 0)}
      >
        <SendHorizontalIcon class="size-4" />
      </Button>
    </AttachmentComposer>
  </form>
</div>
