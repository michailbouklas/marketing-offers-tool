<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import { toast } from "svelte-sonner";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";

  interface Props {
    brandId: number;
    /** Percent (30), not the stored fraction (0.3). */
    idealFcPercent: number | null;
    /** Labour cost as a percent of ex-VAT net sales. */
    labourPercent: number | null;
  }

  let { brandId, idealFcPercent, labourPercent }: Props = $props();

  // A number input binds a number (or null when blank), never a string.
  // svelte-ignore state_referenced_locally
  let idealFcPercentInput = $state<string | number | null>(
    idealFcPercent ?? null,
  );
  // svelte-ignore state_referenced_locally
  let labourPercentInput = $state<string | number | null>(
    labourPercent ?? null,
  );
  let savingPricingTargets = $state(false);

  $effect(() => {
    idealFcPercentInput = idealFcPercent ?? null;
    labourPercentInput = labourPercent ?? null;
  });

  /** null for blank, undefined (after a toast) when invalid. */
  function parsePercent(value: string | number | null, label: string) {
    const trimmed = value === null ? "" : String(value).trim();
    if (trimmed === "") return null;
    const percent = Number.parseFloat(trimmed);
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
      toast.error(`${label} must be a number above 0 and at most 100.`);
      return undefined;
    }
    return percent;
  }

  async function savePricingTargets() {
    if (savingPricingTargets) return;

    const fc = parsePercent(idealFcPercentInput, "Brand Ideal FC %");
    const labour = parsePercent(labourPercentInput, "Brand Labour cost %");
    if (fc === undefined || labour === undefined) return;
    if ((fc ?? 0) + (labour ?? 0) > 100) {
      toast.error("Ideal FC % + Labour cost % cannot exceed 100.");
      return;
    }

    savingPricingTargets = true;
    try {
      const res = await fetch(`/api/admin/brands/${brandId}/pricing-targets`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ideal_fc_perc: fc, labour_perc: labour }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Save failed: ${res.status}`);
      }
      toast.success("Pricing targets saved.");
      await invalidateAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      savingPricingTargets = false;
    }
  }
</script>

<Card.Root>
  <Card.Header>
    <Card.Title>Pricing targets</Card.Title>
    <Card.Description>
      Yearly cost targets for this brand, as a share of ex-VAT net sales. The
      offers data-quality form and recipes calculate Ideal price as (FC € ÷
      Brand Ideal FC %) × 1.05 VAT × 1.07 buffer; offer submissions are blocked
      until the FC target is set. Labour cost % adds prime cost (food + labour)
      and contribution after labour to the recipe and menu engineering views.
    </Card.Description>
  </Card.Header>
  <Card.Content class="space-y-3">
    <div class="grid gap-4 sm:max-w-xl sm:grid-cols-2">
      <div class="grid gap-2">
        <Label for="brand-ideal-fc-perc">Brand Ideal FC %</Label>
        <div class="relative">
          <Input
            id="brand-ideal-fc-perc"
            type="number"
            step="0.1"
            min="0"
            max="100"
            class="pr-10"
            placeholder="e.g. 30"
            bind:value={idealFcPercentInput}
          />
          <span
            class="text-muted-foreground pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm"
            >%</span
          >
        </div>
      </div>
      <div class="grid gap-2">
        <Label for="brand-labour-perc">Brand Labour cost %</Label>
        <div class="relative">
          <Input
            id="brand-labour-perc"
            type="number"
            step="0.1"
            min="0"
            max="100"
            class="pr-10"
            placeholder="e.g. 25"
            bind:value={labourPercentInput}
          />
          <span
            class="text-muted-foreground pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm"
            >%</span
          >
        </div>
      </div>
    </div>
    <p class="text-muted-foreground text-xs">
      Leave blank to clear a target. Stored as fractions, shown as percents.
      Prime cost target = FC % + Labour %.
    </p>
    <div class="flex justify-end">
      <Button onclick={savePricingTargets} disabled={savingPricingTargets}>
        {savingPricingTargets ? "Saving…" : "Save pricing targets"}
      </Button>
    </div>
  </Card.Content>
</Card.Root>
