<script lang="ts">
  import { Switch } from "$lib/components/ui/switch/index.js";

  interface Props {
    /** Brand labour cost as a fraction; the switch is disabled when unset. */
    labourPerc: number | null;
    checked: boolean;
  }

  let { labourPerc, checked = $bindable(false) }: Props = $props();
</script>

<div class="flex items-center gap-2 text-sm">
  <Switch
    id="include-labour"
    bind:checked
    disabled={labourPerc === null}
    aria-describedby="include-labour-hint"
  />
  <label for="include-labour">Include labour</label>
  <span id="include-labour-hint" class="text-muted-foreground text-xs">
    {labourPerc === null
      ? "(set Brand Labour cost % on the brand page)"
      : `(${(labourPerc * 100).toFixed(1)}% of ex-VAT sales)`}
  </span>
</div>
