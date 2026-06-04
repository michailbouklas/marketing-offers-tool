<script lang="ts">
  import { Input } from "$lib/components/ui/input/index.js";
  import {
    NativeSelect,
    NativeSelectOption,
  } from "$lib/components/ui/native-select/index.js";

  // A curated dropdown with a "Custom…" escape hatch, mirroring the
  // composer's sizeChoice/customSize pattern. The bound `value` is always the
  // effective string — off-list values (e.g. from AI prefill) render as a
  // transient option so they stay visible in the select.
  const CUSTOM = "__custom__";

  interface Props {
    value: string;
    options: readonly string[];
    id?: string;
    customPlaceholder?: string;
  }

  let {
    value = $bindable(),
    options,
    id,
    customPlaceholder = "Describe your own…",
  }: Props = $props();

  let customMode = $state(!options.includes(value));

  // AI prefill / external loads change `value` directly — re-derive the mode
  // so curated values snap back to the dropdown and off-list ones open the
  // custom input. User-driven mode changes go through handleChange instead.
  $effect(() => {
    customMode = !options.includes(value);
  });

  function handleChange(event: Event) {
    const next = (event.currentTarget as HTMLSelectElement).value;
    if (next === CUSTOM) {
      customMode = true;
    } else {
      customMode = false;
      value = next;
    }
  }
</script>

<div class="flex flex-col gap-2">
  <NativeSelect
    {id}
    class="w-full"
    value={customMode ? CUSTOM : value}
    onchange={handleChange}
  >
    {#each options as option (option)}
      <NativeSelectOption value={option}>{option}</NativeSelectOption>
    {/each}
    {#if customMode && value.trim() !== "" && !options.includes(value)}
      <NativeSelectOption value={CUSTOM}>{value}</NativeSelectOption>
    {:else}
      <NativeSelectOption value={CUSTOM}>Custom…</NativeSelectOption>
    {/if}
  </NativeSelect>
  {#if customMode}
    <Input
      aria-label="Custom value"
      placeholder={customPlaceholder}
      bind:value
    />
  {/if}
</div>
