<script lang="ts">
  import { toast } from "svelte-sonner";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import CopyIcon from "@lucide/svelte/icons/copy";
  import type { GeneratedCopyDTO } from "$lib/services/copywriter/copywriter";
  import {
    CHANNEL_LABELS,
    COPY_LANGUAGES,
    COPY_LANGUAGE_LABELS,
    COPY_TYPE_LABELS,
    getChannelConstraints,
  } from "$lib/services/copywriter/types";

  interface Props {
    item: GeneratedCopyDTO;
    onFeedback?: (
      variantIndex: number,
      feedback: { rating?: number | null; picked?: boolean },
    ) => void;
  }

  let { item, onFeedback }: Props = $props();

  const fields = $derived(
    getChannelConstraints(item.copyType, item.channel) ?? [],
  );

  const createdLabel = $derived(new Date(item.createdAt).toLocaleString());

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Could not copy to clipboard");
    }
  }

  function rate(variantIndex: number, rating: number) {
    const current = item.variants[variantIndex]?.rating ?? null;
    // Clicking the same star clears the rating.
    onFeedback?.(variantIndex, {
      rating: current === rating ? null : rating,
    });
  }

  function togglePick(variantIndex: number) {
    onFeedback?.(variantIndex, {
      picked: !(item.variants[variantIndex]?.picked ?? false),
    });
  }
</script>

<article class="bg-card grid gap-4 rounded-xl border p-4 shadow-sm">
  <header class="flex flex-wrap items-center justify-between gap-2">
    <div class="flex flex-wrap items-center gap-2">
      <Badge variant="secondary">{COPY_TYPE_LABELS[item.copyType]}</Badge>
      <Badge variant="outline">
        {CHANNEL_LABELS[item.channel] ?? item.channel}
      </Badge>
      {#if item.tone}
        <Badge variant="outline">Tone: {item.tone}</Badge>
      {/if}
      {#if item.status === "failed"}
        <Badge variant="destructive">Failed</Badge>
      {/if}
    </div>
    <p class="text-muted-foreground text-xs">{createdLabel}</p>
  </header>

  <p class="text-muted-foreground line-clamp-2 text-sm">{item.brief}</p>

  {#if item.status === "failed"}
    <p
      class="border-destructive/40 bg-destructive/10 rounded-md border px-3 py-2 text-sm"
    >
      {item.errorMessage ?? "Generation failed."}
    </p>
  {:else}
    <div class="grid gap-3">
      {#each item.variants as variant, variantIndex (variantIndex)}
        <div
          class={[
            "grid gap-3 rounded-lg border p-3",
            variant.picked ? "border-primary ring-primary/30 ring-1" : "",
          ].join(" ")}
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <p class="text-sm font-medium">Variant {variantIndex + 1}</p>
            <div class="flex items-center gap-2">
              <div class="flex items-center" role="group" aria-label="Rating">
                {#each [1, 2, 3, 4, 5] as star (star)}
                  <button
                    type="button"
                    class={[
                      "px-0.5 text-base leading-none transition-colors",
                      (variant.rating ?? 0) >= star
                        ? "text-amber-500"
                        : "text-muted-foreground/40 hover:text-amber-400",
                    ].join(" ")}
                    aria-label={`Rate ${star} of 5`}
                    onclick={() => rate(variantIndex, star)}
                  >
                    ★
                  </button>
                {/each}
              </div>
              <Button
                type="button"
                variant={variant.picked ? "default" : "outline"}
                size="sm"
                onclick={() => togglePick(variantIndex)}
              >
                {variant.picked ? "Picked" : "Pick"}
              </Button>
            </div>
          </div>

          <div class="grid gap-3 md:grid-cols-2">
            {#each COPY_LANGUAGES as lang (lang)}
              <div class="grid content-start gap-2">
                <p
                  class="text-muted-foreground text-xs font-semibold tracking-[0.14em] uppercase"
                >
                  {COPY_LANGUAGE_LABELS[lang]}
                </p>
                {#each fields as field (field.field)}
                  {@const value = variant[lang][field.field] ?? ""}
                  {@const over =
                    field.maxLength !== undefined &&
                    value.length > field.maxLength}
                  <div class="grid gap-1">
                    <div class="flex items-center justify-between gap-2">
                      <span class="text-muted-foreground text-xs">
                        {field.label}
                        <span
                          class={over ? "text-destructive font-medium" : ""}
                        >
                          ({value.length}{field.maxLength !== undefined
                            ? `/${field.maxLength}`
                            : ""})
                        </span>
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        class="h-6 px-1.5"
                        aria-label={`Copy ${COPY_LANGUAGE_LABELS[lang]} ${field.label}`}
                        onclick={() => copyText(value)}
                      >
                        <CopyIcon class="size-3.5" />
                      </Button>
                    </div>
                    <p
                      class={[
                        "text-sm whitespace-pre-wrap",
                        over ? "text-destructive" : "",
                      ].join(" ")}
                    >
                      {value}
                    </p>
                  </div>
                {/each}
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</article>
