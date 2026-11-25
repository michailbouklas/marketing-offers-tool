<script lang="ts">
  import { calculationSteps } from "$lib/components/ai-chat/calculation-steps";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Collapsible from "$lib/components/ui/collapsible/index.js";
  import CalculatorIcon from "@lucide/svelte/icons/calculator";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import CopyIcon from "@lucide/svelte/icons/copy";
  import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
  import { toast } from "svelte-sonner";

  let { parts }: { parts: readonly unknown[] } = $props();

  const steps = $derived(calculationSteps(parts));
  let open = $state(false);

  async function copySql(sql: string) {
    try {
      await navigator.clipboard.writeText(sql);
      toast.success("SQL copied.");
    } catch {
      toast.error("Could not copy to clipboard.");
    }
  }

  const plural = (count: number, label: string) =>
    label !== "rows"
      ? `${label} (${count})`
      : count === 1
        ? "1 row"
        : `${count} rows`;
</script>

{#if steps.length > 0}
  <Collapsible.Root bind:open>
    <Collapsible.Trigger
      class="text-muted-foreground hover:text-foreground flex cursor-pointer items-center gap-1.5 text-xs"
    >
      <CalculatorIcon class="size-3" />
      How this was calculated
      {#if steps.some((step) => step.truncated)}
        <TriangleAlertIcon class="size-3 text-amber-600" />
        <span class="sr-only">A result was cut at the row limit</span>
      {/if}
      <ChevronRightIcon
        class={`size-3 transition-transform ${open ? "rotate-90" : ""}`}
      />
    </Collapsible.Trigger>
    <Collapsible.Content>
      <ol class="mt-2 space-y-3 border-l pl-3 text-xs">
        {#each steps as step, index (step.key)}
          <li class="space-y-1">
            <p class="font-medium">{index + 1}. {step.label}</p>
            {#if step.inputs.length > 0}
              <dl class="text-muted-foreground">
                {#each step.inputs as input (input.label)}
                  <div class="flex gap-1.5">
                    <dt class="shrink-0">{input.label}:</dt>
                    <dd class="text-foreground break-words">{input.value}</dd>
                  </div>
                {/each}
              </dl>
            {/if}
            {#if step.rawInput}
              <pre
                class="bg-muted max-h-40 overflow-auto rounded-md border p-2"><code
                  class="font-mono whitespace-pre-wrap">{step.rawInput}</code
                ></pre>
            {/if}
            {#if step.sql}
              <div class="relative">
                <pre
                  class="bg-muted max-h-64 overflow-auto rounded-md border p-2 pr-9"><code
                    class="font-mono whitespace-pre-wrap">{step.sql}</code
                  ></pre>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  class="text-muted-foreground hover:text-foreground absolute top-1 right-1"
                  aria-label="Copy SQL"
                  title="Copy SQL"
                  onclick={() => copySql(step.sql ?? "")}
                >
                  <CopyIcon class="size-3.5" />
                </Button>
              </div>
            {/if}
            {#if step.failed}
              <p class="text-destructive">Failed — returned no data.</p>
            {:else if step.returned.length > 0}
              <p class="text-muted-foreground">
                Returned {step.returned
                  .map((item) => plural(item.count, item.label))
                  .join(", ")}.
              </p>
            {/if}
            {#if step.truncated}
              <p
                class="flex items-start gap-1.5 text-amber-700 dark:text-amber-500"
              >
                <TriangleAlertIcon class="mt-0.5 size-3 shrink-0" />
                The result was cut at the row limit, so more rows exist than were
                returned. Figures built from these rows may be incomplete.
              </p>
            {/if}
          </li>
        {/each}
      </ol>
    </Collapsible.Content>
  </Collapsible.Root>
{/if}
