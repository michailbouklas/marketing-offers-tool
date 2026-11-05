<script lang="ts">
  import { Switch } from "$lib/components/ui/switch/index.js";
  import type { EnergyCost } from "$lib/services/recipes";

  interface Props {
    brandAlias: string;
    /** Brand energy cost as a fraction of ex-VAT sales; null while off. */
    energyPerc: number | null;
  }

  let { brandAlias, energyPerc = $bindable(null) }: Props = $props();

  let checked = $state(false);
  let loading = $state(false);
  let hint = $state("");

  async function onCheckedChange(value: boolean) {
    energyPerc = null;
    hint = "";
    if (!value) return;

    loading = true;
    try {
      const response = await fetch(
        `/api/recipes/energy/${encodeURIComponent(brandAlias)}`,
      );
      if (!response.ok) {
        hint =
          response.status === 404
            ? "(brand not found on the energy platform)"
            : "(energy platform unavailable)";
        checked = false;
        return;
      }
      const body = (await response.json()) as EnergyCost;
      if (body.percent === null) {
        hint = "(no energy data for this brand)";
        checked = false;
        return;
      }
      // Ignore a late answer when the user already switched it off.
      if (!checked) return;
      energyPerc = body.percent / 100;
      hint = `(${body.percent.toFixed(1)}% of net sales, ${body.from} – ${body.to})`;
    } catch {
      hint = "(energy platform unavailable)";
      checked = false;
    } finally {
      loading = false;
    }
  }
</script>

<div class="flex items-center gap-2 text-sm">
  <Switch
    id="include-energy"
    bind:checked
    {onCheckedChange}
    disabled={loading}
    aria-describedby="include-energy-hint"
  />
  <label for="include-energy">Include energy cost</label>
  <span id="include-energy-hint" class="text-muted-foreground text-xs">
    {loading ? "(loading…)" : hint}
  </span>
</div>
