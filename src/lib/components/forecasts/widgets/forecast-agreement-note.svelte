<script lang="ts">
  import * as Alert from "$lib/components/ui/alert/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import {
    agreementSentence,
    spreadPct,
  } from "$lib/services/forecasts/forecast-narrative";
  import type { ForecastResult } from "$lib/services/forecasts/forecast-types";
  import ScaleIcon from "@lucide/svelte/icons/scale";

  let {
    results,
    compareHref,
  }: {
    /** Ready results (needs at least two to render). */
    results: ForecastResult[];
    compareHref: string;
  } = $props();

  const sentence = $derived(agreementSentence(results));
  const spread = $derived(
    spreadPct(results.map((result) => result.summary.horizonTotal)),
  );
</script>

{#if sentence}
  <Alert.Root class="bg-muted/40">
    <ScaleIcon />
    <Alert.Title>How much the models agree</Alert.Title>
    <Alert.Description>{sentence}</Alert.Description>
    {#if spread >= 5}
      <Alert.Action>
        <Button variant="outline" size="sm" href={compareHref}>Compare</Button>
      </Alert.Action>
    {/if}
  </Alert.Root>
{/if}
