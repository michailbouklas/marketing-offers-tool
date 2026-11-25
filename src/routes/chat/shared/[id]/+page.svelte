<script lang="ts">
  import { enhance } from "$app/forms";
  import { renderMarkdown } from "$lib/components/ai-chat/markdown";
  import MessageTimestamp from "$lib/components/ai-chat/message-timestamp.svelte";
  import ToolPart from "$lib/components/ai-chat/tool-part.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import CopyPlusIcon from "@lucide/svelte/icons/copy-plus";
  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();

  let copying = $state(false);
</script>

<svelte:head>
  <title>{data.title} | Shared conversation</title>
</svelte:head>

<div class="mx-auto w-full max-w-3xl space-y-6 px-4 py-6">
  <header
    class="flex flex-wrap items-start justify-between gap-3 border-b pb-4"
  >
    <div class="min-w-0 space-y-1">
      <h1 class="text-xl font-semibold break-words">{data.title}</h1>
      <p class="text-muted-foreground text-sm">
        {data.assistant} · shared by {data.isOwner ? "you" : data.ownerName} · read-only
      </p>
    </div>
    <form
      method="POST"
      action="?/copy"
      use:enhance={() => {
        copying = true;
        return async ({ update }) => {
          await update();
          copying = false;
        };
      }}
    >
      <Button type="submit" disabled={copying}>
        <CopyPlusIcon class="size-4" />
        Continue as my copy
      </Button>
    </form>
  </header>

  {#if data.messages.length === 0}
    <p class="text-muted-foreground text-sm">This conversation is empty.</p>
  {/if}

  {#each data.messages as message (message.id)}
    {#if message.role === "user"}
      <div class="flex justify-end">
        <div
          class="bg-primary text-primary-foreground max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap"
        >
          {message.parts
            .flatMap((part) => ("text" in part ? [part.text] : []))
            .join("\n\n")}
        </div>
      </div>
    {:else}
      <div class="space-y-2">
        {#each message.parts as part, partIndex (partIndex)}
          {#if "text" in part}
            <div
              class="prose prose-sm dark:prose-invert prose-p:my-1.5 prose-table:my-2 prose-th:px-2 prose-td:px-2 max-w-none text-sm"
            >
              <!-- eslint-disable-next-line svelte/no-at-html-tags — sanitized in renderMarkdown -->
              {@html renderMarkdown(part.text)}
            </div>
          {:else}
            <ToolPart {part} />
          {/if}
        {/each}
        <MessageTimestamp metadata={{ createdAt: message.createdAt }} />
      </div>
    {/if}
  {/each}
</div>
