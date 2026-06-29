<script lang="ts">
  import { untrack } from "svelte";
  import { zod4Client } from "sveltekit-superforms/adapters";
  import { superForm } from "sveltekit-superforms/client";
  import type { SuperValidated } from "sveltekit-superforms";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import * as NativeSelect from "$lib/components/ui/native-select/index.js";
  import {
    aggregatorLabel,
    aggregatorOptions,
    type UrlToScrapeActionMessage,
    type UrlToScrapeFormData,
    urlToScrapeFormSchema,
  } from "$lib/services/urls-to-scrape-form";

  type Props = {
    form: SuperValidated<UrlToScrapeFormData>;
    action?: string;
    onSuccess?: (message: UrlToScrapeActionMessage) => void;
  };

  let {
    form: initialForm,
    action = "?/createUrl",
    onSuccess,
  }: Props = $props();

  // svelte-ignore state_referenced_locally
  const { form, errors, constraints, enhance, submitting } = superForm(
    untrack(() => initialForm),
    {
      applyAction: true,
      invalidateAll: true,
      resetForm: true,
      id: "create-url",
      validators: zod4Client(urlToScrapeFormSchema),
      onUpdated: ({ form }) => {
        if (form.valid && form.message) {
          onSuccess?.(form.message as UrlToScrapeActionMessage);
        }
      },
    },
  );
</script>

<form method="POST" {action} use:enhance class="space-y-5">
  <div class="space-y-2">
    <Label for="url-to-scrape-url">URL</Label>
    <Input
      id="url-to-scrape-url"
      name="url"
      placeholder="https://..."
      bind:value={$form.url}
      aria-invalid={!!$errors.url}
      {...$constraints.url}
    />
    {#if $errors.url}
      <p class="text-destructive text-sm">{$errors.url}</p>
    {/if}
  </div>

  <div class="space-y-2">
    <Label for="url-to-scrape-aggregator">Aggregator</Label>
    <NativeSelect.Root
      id="url-to-scrape-aggregator"
      name="aggregator"
      class="w-full"
      bind:value={$form.aggregator}
      aria-invalid={!!$errors.aggregator}
    >
      <NativeSelect.Option value="">Select aggregator</NativeSelect.Option>
      {#each aggregatorOptions as option}
        <NativeSelect.Option value={option}>
          {aggregatorLabel(option)}
        </NativeSelect.Option>
      {/each}
    </NativeSelect.Root>
    {#if $errors.aggregator}
      <p class="text-destructive text-sm">{$errors.aggregator}</p>
    {/if}
  </div>

  <div class="flex justify-end">
    <Button type="submit" disabled={$submitting}>
      {$submitting ? "Saving..." : "Add URL"}
    </Button>
  </div>
</form>
