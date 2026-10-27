<script lang="ts">
  import { toast } from "svelte-sonner";
  import * as AlertDialog from "$lib/components/ui/alert-dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Textarea } from "$lib/components/ui/textarea/index.js";

  interface Props {
    brandId: number;
    /** Guidelines and rules are stored under the slug; saving is disabled without one. */
    slug: string | null;
    guidelines: string;
    complianceRules: string;
  }

  let { brandId, slug, guidelines, complianceRules }: Props = $props();

  // Props seed the drafts; the $effects below re-sync them after invalidateAll().
  // svelte-ignore state_referenced_locally
  let guidelinesDraft = $state(guidelines);
  let savingGuidelines = $state(false);
  // svelte-ignore state_referenced_locally
  let rulesDraft = $state(complianceRules);
  let savingRules = $state(false);
  let seedRulesDialogOpen = $state(false);

  $effect(() => {
    guidelinesDraft = guidelines;
  });

  $effect(() => {
    rulesDraft = complianceRules;
  });

  async function saveGuidelines() {
    if (savingGuidelines) return;
    savingGuidelines = true;
    try {
      const res = await fetch(`/api/admin/brands/${brandId}/guidelines`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ markdown: guidelinesDraft }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Save failed: ${res.status}`);
      }
      toast.success("Guidelines saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      savingGuidelines = false;
    }
  }

  async function saveComplianceRules() {
    if (savingRules) return;
    savingRules = true;
    try {
      const res = await fetch(`/api/admin/brands/${brandId}/compliance-rules`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ markdown: rulesDraft }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Save failed: ${res.status}`);
      }
      toast.success("Compliance rules saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      savingRules = false;
    }
  }

  /** Copies the (unsaved) guidelines text into the rules box as a starting point. */
  function seedRulesFromGuidelines() {
    if (!guidelinesDraft.trim()) {
      toast.info("There are no guidelines to start from yet.");
      return;
    }
    if (rulesDraft.trim()) {
      seedRulesDialogOpen = true;
      return;
    }
    rulesDraft = guidelinesDraft;
  }

  function confirmSeedRules() {
    seedRulesDialogOpen = false;
    rulesDraft = guidelinesDraft;
  }
</script>

<div class="grid gap-6 lg:grid-cols-2">
  <Card.Root>
    <Card.Header>
      <Card.Title>Guidelines</Card.Title>
      <Card.Description>
        Injected at the start of the final prompt for any generation that
        selects this brand. Markdown is sent verbatim. Not used by Enhance or by
        the Image Compliance Checker.
      </Card.Description>
    </Card.Header>
    <Card.Content class="space-y-3">
      <Textarea
        rows={14}
        bind:value={guidelinesDraft}
        placeholder="e.g. Use vibrant, appetising colours; show food at 45° angle."
      />
      <div class="flex justify-end">
        <Button onclick={saveGuidelines} disabled={savingGuidelines || !slug}>
          {savingGuidelines ? "Saving…" : "Save guidelines"}
        </Button>
      </div>
    </Card.Content>
  </Card.Root>

  <Card.Root>
    <Card.Header>
      <Card.Title>Compliance rules</Card.Title>
      <Card.Description>
        Used only by the Image Compliance Checker. Write verifiable rules (must
        / must not): logo placement and clear space, allowed colours, mandatory
        elements, forbidden content. Never injected into generation.
      </Card.Description>
    </Card.Header>
    <Card.Content class="space-y-3">
      <Textarea
        rows={14}
        bind:value={rulesDraft}
        placeholder="e.g. - The logo must appear top-left with at least 10% clear space.&#10;- Backgrounds must use the brand blue; red backgrounds are forbidden."
      />
      <div class="flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          type="button"
          onclick={seedRulesFromGuidelines}
          disabled={savingRules || !slug}
        >
          Start from guidelines
        </Button>
        <Button
          type="button"
          onclick={saveComplianceRules}
          disabled={savingRules || !slug}
        >
          {savingRules ? "Saving…" : "Save rules"}
        </Button>
      </div>
    </Card.Content>
  </Card.Root>
</div>

<AlertDialog.Root bind:open={seedRulesDialogOpen}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Replace the compliance rules?</AlertDialog.Title>
      <AlertDialog.Description>
        The rules box already has text. Starting from the guidelines replaces it
        with the current guidelines text (nothing is saved until you click Save
        rules).
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>Keep current rules</AlertDialog.Cancel>
      <AlertDialog.Action onclick={confirmSeedRules}>Replace</AlertDialog.Action
      >
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
