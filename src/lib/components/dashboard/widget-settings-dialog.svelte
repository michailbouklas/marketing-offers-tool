<script lang="ts">
  import { defaults, superForm } from "sveltekit-superforms";
  import { zod4Client } from "sveltekit-superforms/adapters";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import * as NativeSelect from "$lib/components/ui/native-select/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import {
    SALES_PERIOD_LABELS,
    salesPeriods,
    salesSettings,
    type SalesWidgetSettings,
  } from "$lib/dashboard/widgets";

  let {
    open = $bindable(false),
    title,
    settings,
    brands,
    onsave,
  }: {
    open: boolean;
    title: string;
    settings: SalesWidgetSettings;
    brands: { alias: string; name: string }[];
    onsave: (settings: SalesWidgetSettings) => void;
  } = $props();

  const { form, enhance, reset } = superForm(
    defaults(salesSettings.parse({}), zod4Client(salesSettings)),
    {
      SPA: true,
      validators: zod4Client(salesSettings),
      onUpdate({ form: submitted }) {
        if (!submitted.valid) return;
        onsave({ ...submitted.data, brand: submitted.data.brand || null });
        open = false;
      },
    },
  );

  // Load the widget's current settings each time the dialog opens.
  $effect(() => {
    if (open) reset({ data: { ...settings, brand: settings.brand ?? "" } });
  });
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-sm">
    <Dialog.Header>
      <Dialog.Title>{title} settings</Dialog.Title>
      <Dialog.Description
        >Brand and period this widget shows.</Dialog.Description
      >
    </Dialog.Header>
    <form method="POST" use:enhance class="space-y-4">
      <div class="space-y-2">
        <Label for="widget-brand">Brand</Label>
        <NativeSelect.Root
          id="widget-brand"
          name="brand"
          bind:value={$form.brand}
        >
          <NativeSelect.Option value="">
            First brand ({brands[0]?.name ?? "none"})
          </NativeSelect.Option>
          {#each brands as brand (brand.alias)}
            <NativeSelect.Option value={brand.alias}
              >{brand.name}</NativeSelect.Option
            >
          {/each}
        </NativeSelect.Root>
      </div>
      <div class="space-y-2">
        <Label for="widget-period">Period</Label>
        <NativeSelect.Root
          id="widget-period"
          name="period"
          bind:value={$form.period}
        >
          {#each salesPeriods as period (period)}
            <NativeSelect.Option value={period}>
              {SALES_PERIOD_LABELS[period]}
            </NativeSelect.Option>
          {/each}
        </NativeSelect.Root>
      </div>
      <Dialog.Footer>
        <Button type="button" variant="outline" onclick={() => (open = false)}>
          Cancel
        </Button>
        <Button type="submit">Save</Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
