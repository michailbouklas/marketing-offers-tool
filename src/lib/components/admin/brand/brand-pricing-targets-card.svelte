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
  }

  let { brandId, idealFcPercent }: Props = $props();

  // A number input binds a number (or null when blank), never a string.
  // svelte-ignore state_referenced_locally
  let idealFcPercentInput = $state<string | number | null>(
    idealFcPercent ?? null,
  );
  let savingPricingTargets = $state(false);

  $effect(() => {
    idealFcPercentInput = idealFcPercent ?? null;
  });

  async function savePricingTargets() {
    if (savingPricingTargets) return;

    const trimmed =
      idealFcPercentInput === null ? "" : String(idealFcPercentInput).trim();
    const percent = trimmed === "" ? null : Number.parseFloat(trimmed);

    if (percent !== null && (!Number.isFinite(percent) || percent <= 0)) {
      toast.error("Brand Ideal FC % must be a number greater than 0.");
      return;
    }

    if (percent !== null && percent > 100) {
      toast.error("Brand Ideal FC % cannot exceed 100.");
      return;
    }

    savingPricingTargets = true;
    try {
      const res = await fetch(`/api/admin/brands/${brandId}/pricing-targets`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ideal_fc_perc: percent }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Save failed: ${res.status}`);
      }
      toast.success(
        percent === null
          ? "Brand Ideal FC % cleared."
          : "Brand Ideal FC % saved.",
      );
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
      Yearly food-cost target for this brand. The offers data-quality form uses
      it to calculate Ideal price as (FC € ÷ Brand Ideal FC %) × 1.05 × 1.07.
      Submissions for this brand are blocked until it is set.
    </Card.Description>
  </Card.Header>
  <Card.Content class="space-y-3">
    <div class="grid gap-2 sm:max-w-xs">
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
      <p class="text-muted-foreground text-xs">
        Leave blank to clear the target. Stored as a fraction, shown as a
        percent.
      </p>
    </div>
    <div class="flex justify-end">
      <Button onclick={savePricingTargets} disabled={savingPricingTargets}>
        {savingPricingTargets ? "Saving…" : "Save pricing targets"}
      </Button>
    </div>
  </Card.Content>
</Card.Root>
