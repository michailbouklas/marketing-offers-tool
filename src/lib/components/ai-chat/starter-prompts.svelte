<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import type { ChatPromptItem } from "$lib/services/chat-prompts.server";
  import { toast } from "svelte-sonner";
  import GlobeIcon from "@lucide/svelte/icons/globe";
  import GlobeLockIcon from "@lucide/svelte/icons/globe-lock";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";

  interface Props {
    /** Agent whose saved prompts are listed. */
    agentId: string;
    /** Called with the prompt text when one is clicked. */
    onPick: (text: string) => void;
  }

  let { agentId, onPick }: Props = $props();

  const ENDPOINT = "/api/ai/chat/prompts";
  // Mirrors CHAT_PROMPT_MAX_LENGTH; the server is the one that enforces it.
  const MAX_LENGTH = 500;

  let prompts = $state<ChatPromptItem[]>([]);
  let canPublish = $state(false);
  let draft = $state("");
  let saving = $state(false);

  // Team prompts first, then the user's own — also after local changes.
  const ordered = $derived([
    ...prompts.filter((prompt) => prompt.published),
    ...prompts.filter((prompt) => !prompt.published),
  ]);

  $effect(() => {
    const id = agentId;
    prompts = [];
    void (async () => {
      try {
        const response = await fetch(
          `${ENDPOINT}?agentId=${encodeURIComponent(id)}`,
        );
        if (!response.ok || id !== agentId) return;
        const data = (await response.json()) as {
          prompts: ChatPromptItem[];
          canPublish: boolean;
        };
        prompts = data.prompts;
        canPublish = data.canPublish;
      } catch {
        // Starter prompts are optional; the chat works without them.
      }
    })();
  });

  async function failed(response: Response, action: string) {
    if (response.ok) return false;
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    toast.error(body?.message ?? `Could not ${action} the prompt.`);
    return true;
  }

  async function add(event: SubmitEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || saving) return;

    saving = true;
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentId, text }),
      });
      if (await failed(response, "save")) return;
      const { prompt } = (await response.json()) as { prompt: ChatPromptItem };
      prompts = [...prompts, prompt];
      draft = "";
    } catch {
      toast.error("Could not save the prompt.");
    } finally {
      saving = false;
    }
  }

  async function togglePublished(prompt: ChatPromptItem) {
    const published = !prompt.published;
    try {
      const response = await fetch(ENDPOINT, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentId, id: prompt.id, published }),
      });
      if (await failed(response, published ? "publish" : "unpublish")) return;
      prompts = prompts.map((item) =>
        item.id === prompt.id ? { ...item, published } : item,
      );
    } catch {
      toast.error("Could not update the prompt.");
    }
  }

  async function remove(prompt: ChatPromptItem) {
    try {
      const response = await fetch(
        `${ENDPOINT}?agentId=${encodeURIComponent(agentId)}&id=${prompt.id}`,
        { method: "DELETE" },
      );
      if (await failed(response, "delete")) return;
      prompts = prompts.filter((item) => item.id !== prompt.id);
    } catch {
      toast.error("Could not delete the prompt.");
    }
  }
</script>

<div class="w-full max-w-md space-y-2 text-left">
  {#if ordered.length > 0}
    <ul class="divide-y">
      {#each ordered as prompt (prompt.id)}
        <li class="flex items-center gap-1">
          <button
            type="button"
            class="text-muted-foreground hover:text-foreground min-w-0 flex-1 cursor-pointer py-2.5 text-left text-sm"
            onclick={() => onPick(prompt.text)}
          >
            {prompt.text}
            {#if prompt.published}
              <span class="text-xs opacity-70">· Team</span>
            {/if}
          </button>
          {#if canPublish && prompt.mine}
            {@const label = prompt.published
              ? "Unpublish prompt"
              : "Publish prompt to the team"}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              class="text-muted-foreground hover:text-foreground"
              aria-label={label}
              title={label}
              onclick={() => togglePublished(prompt)}
            >
              {#if prompt.published}
                <GlobeLockIcon class="size-3.5" />
              {:else}
                <GlobeIcon class="size-3.5" />
              {/if}
            </Button>
          {/if}
          {#if prompt.mine || (canPublish && prompt.published)}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              class="text-muted-foreground hover:text-destructive"
              aria-label="Delete prompt"
              title="Delete prompt"
              onclick={() => remove(prompt)}
            >
              <Trash2Icon class="size-3.5" />
            </Button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}

  <form class="flex items-center gap-2" onsubmit={add}>
    <Input
      bind:value={draft}
      maxlength={MAX_LENGTH}
      placeholder="Save a prompt you ask often"
      aria-label="New starter prompt"
      autocomplete="off"
      class="h-8 text-sm"
    />
    <Button
      type="submit"
      variant="outline"
      size="sm"
      disabled={saving || draft.trim().length === 0}
    >
      <PlusIcon class="size-3.5" />
      Add prompt
    </Button>
  </form>
</div>
