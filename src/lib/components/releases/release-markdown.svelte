<script lang="ts">
  import { browser } from "$app/environment";
  import { renderMarkdown } from "$lib/components/ai-chat/markdown";

  /**
   * Release-note body. `renderMarkdown` only sanitises in the browser
   * (DOMPurify needs a DOM), so the server renders nothing and the client
   * fills it in — no flash of escaped markdown on hydration.
   */
  let { body, class: className = "" }: { body: string; class?: string } =
    $props();

  const html = $derived(browser ? renderMarkdown(body) : "");
</script>

<div class="prose prose-sm dark:prose-invert max-w-none {className}">
  <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitised by DOMPurify in renderMarkdown -->
  {@html html}
</div>
