<script lang="ts">
  import CheckCircle2Icon from "@lucide/svelte/icons/check-circle-2";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
  import ShieldCheckIcon from "@lucide/svelte/icons/shield-check";
  import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
  import { toast } from "svelte-sonner";
  import { zod4Client } from "sveltekit-superforms/adapters";
  import { superForm } from "sveltekit-superforms/client";
  import { untrack } from "svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import * as NativeSelect from "$lib/components/ui/native-select/index.js";
  import { Separator } from "$lib/components/ui/separator/index.js";
  import { Textarea } from "$lib/components/ui/textarea/index.js";
  import {
    applyGapPricingLookupDefaults,
    gapPricingFormSchema,
    mapGapPricingFormToPayload,
    normalizeMoneyInput,
    normalizePercentInput,
    type GapPricingFormData,
    type LookupOption,
  } from "$lib/services/offers-data-quality";
  import type { PageData } from "./$types";

  type SubmitResponse = {
    staging_id: number;
    status: "pending";
    submitted_at: string;
  };

  let { data }: { data: PageData } = $props();

  let subcategoryOptions = $state<LookupOption[]>([]);
  let subcategoryLoading = $state(false);
  let submitted = $state<SubmitResponse | null>(null);
  let serverError = $state<string | null>(null);
  let approvalSubmitting = $state<"approve" | "reject" | null>(null);

  const missingFields = $derived.by(() => new Set(data.gap.missing_fields));
  const detectedAt = $derived.by(() =>
    new Date(data.gap.detected_at).toLocaleDateString(),
  );

  const { form, errors, constraints, validateForm, submitting } = superForm(
    untrack(() => data.form),
    {
      SPA: true,
      dataType: "json",
      resetForm: false,
      validators: zod4Client(gapPricingFormSchema),
    },
  );

  const discountPreview = $derived.by(() => {
    const idealPrice = Number.parseFloat($form.ideal_price);
    const sellingPrice = Number.parseFloat($form.selling_price);

    if (
      Number.isNaN(idealPrice) ||
      Number.isNaN(sellingPrice) ||
      idealPrice <= 0 ||
      sellingPrice > idealPrice
    ) {
      return null;
    }

    return (idealPrice - sellingPrice).toFixed(2);
  });
  const missingCount = $derived(data.gap.missing_fields.length);
  const notesCount = $derived($form.notes.length);
  const subcategoryDisabled = $derived(!$form.category || subcategoryLoading);
  const reviewSubmission = $derived(data.pendingSubmission);
  const isReviewMode = $derived(Boolean(reviewSubmission));
  const currentDimOfferRows = $derived.by(() => [
    {
      label: "Channel",
      current: data.gap.current_dim_offers.channel ?? "-",
      proposed: reviewSubmission?.channel ?? "-",
    },
    {
      label: "Category",
      current: data.gap.current_dim_offers.category ?? "-",
      proposed: reviewSubmission?.category ?? "-",
    },
    {
      label: "Subcategory",
      current: data.gap.current_dim_offers.subcategory ?? "-",
      proposed: reviewSubmission?.subcategory ?? "-",
    },
    {
      label: "Ideal price",
      current: moneyDisplay(data.gap.current_dim_offers.ideal_price),
      proposed: reviewSubmission ? `EUR ${reviewSubmission.ideal_price}` : "-",
    },
    {
      label: "Selling price",
      current: moneyDisplay(data.gap.current_dim_offers.selling_price),
      proposed: reviewSubmission
        ? `EUR ${reviewSubmission.selling_price}`
        : "-",
    },
    {
      label: "FC %",
      current:
        data.gap.current_dim_offers.fc_perc === null
          ? "-"
          : `${(data.gap.current_dim_offers.fc_perc * 100).toFixed(2)}%`,
      proposed: reviewSubmission ? `${reviewSubmission.fc_perc}%` : "-",
    },
    {
      label: "Marketing spend",
      current: moneyDisplay(data.gap.current_dim_offers.mktg_spend),
      proposed: reviewSubmission?.mktg_spend
        ? `EUR ${reviewSubmission.mktg_spend}`
        : "-",
    },
  ]);

  let hydratedCategory = $state($form.category);

  $effect(() => {
    subcategoryOptions = data.subcategories;
  });

  $effect(() => {
    const defaults = applyGapPricingLookupDefaults($form, {
      channels: data.channels,
      categories: data.categories,
      subcategories: subcategoryOptions,
    });

    if ($form.channel !== defaults.channel) {
      $form.channel = defaults.channel;
    }

    if ($form.category !== defaults.category) {
      $form.category = defaults.category;
    }

    if ($form.subcategory !== defaults.subcategory) {
      $form.subcategory = defaults.subcategory;
    }
  });

  $effect(() => {
    const nextCategory = $form.category;

    if (!nextCategory || nextCategory === hydratedCategory) {
      hydratedCategory = nextCategory;
      return;
    }

    hydratedCategory = nextCategory;
    void loadSubcategories(nextCategory, { preserveIfAvailable: false });
  });

  async function loadSubcategories(
    categoryName: string,
    options: { preserveIfAvailable: boolean },
  ) {
    const category = data.categories.find(
      (option) => option.name === categoryName,
    );

    if (!category) {
      subcategoryOptions = [];
      $form.subcategory = "";
      return;
    }

    subcategoryLoading = true;
    serverError = null;

    try {
      const response = await fetch(
        `/api/subcategories?category_id=${category.id}`,
      );

      if (!response.ok) {
        throw new Error("Unable to load subcategories");
      }

      const nextOptions = (await response.json()) as LookupOption[];
      subcategoryOptions = nextOptions;

      const currentValue = $form.subcategory;
      const stillAvailable = nextOptions.some(
        (option) => option.name === currentValue,
      );

      if (!options.preserveIfAvailable || !stillAvailable) {
        $form.subcategory = nextOptions[0]?.name ?? "";
      }
    } catch (error) {
      subcategoryOptions = [];
      $form.subcategory = "";
      serverError =
        error instanceof Error ? error.message : "Unable to load subcategories";
    } finally {
      subcategoryLoading = false;
    }
  }

  async function submitPricingForm() {
    serverError = null;

    const validation = await validateForm({ update: true, focusOnError: true });

    if (!validation.valid) {
      toast.error("Please fix the highlighted fields before submitting.");
      return;
    }

    let response: Response;

    try {
      response = await fetch(`/api/gaps/${data.gap.dq_id}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(
          mapGapPricingFormToPayload($form as GapPricingFormData),
        ),
      });
    } catch {
      serverError = "Submission failed — please try again.";
      toast.error(serverError);
      return;
    }

    const result = (await response.json()) as
      | SubmitResponse
      | { error?: string; errors?: Record<string, string> };

    if (!response.ok) {
      if ("errors" in result && result.errors) {
        for (const [field, message] of Object.entries(result.errors)) {
          await validateServerField(field, message);
        }
      }

      const errorMessage =
        "error" in result && result.error
          ? result.error
          : "Submission failed — please try again.";

      serverError = errorMessage;
      toast.error(errorMessage);
      return;
    }

    if (!("staging_id" in result)) {
      serverError = "Submission failed — please try again.";
      toast.error(serverError);
      return;
    }

    submitted = result;
    toast.success(`Submitted for approval — ${data.gap.item_name}`);
  }

  async function handleApprovalDecision(mode: "approve" | "reject") {
    if (!reviewSubmission) {
      return;
    }

    approvalSubmitting = mode;
    serverError = null;

    try {
      const response = await fetch(
        `/api/gaps/submissions/${reviewSubmission.id}/${mode}`,
        {
          method: "POST",
        },
      );

      const result = (await response.json()) as {
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        // SvelteKit's error() helper (e.g. the 403 auth guard) puts the text
        // in `message`; our handlers use `error`.
        throw new Error(
          result.error ?? result.message ?? `Unable to ${mode} submission`,
        );
      }

      toast.success(
        mode === "approve"
          ? `Approved — ${data.gap.item_name}`
          : `Rejected — ${data.gap.item_name}`,
      );

      window.location.href = "/offers-data-quality";
    } catch (error) {
      serverError =
        error instanceof Error ? error.message : `Unable to ${mode} submission`;
      toast.error(serverError);
    } finally {
      approvalSubmitting = null;
    }
  }

  async function validateServerField(field: string, message: string) {
    if (
      field === "channel" ||
      field === "category" ||
      field === "subcategory" ||
      field === "ideal_price" ||
      field === "selling_price" ||
      field === "fc_perc" ||
      field === "mktg_spend" ||
      field === "notes"
    ) {
      await validateFormField(field, message);
    }
  }

  async function validateFormField(
    field: keyof GapPricingFormData,
    message: string,
  ) {
    await validateFormFieldInternal(field, message);
  }

  async function validateFormFieldInternal(
    field: keyof GapPricingFormData,
    message: string,
  ) {
    await validateFieldMap[field](message);
  }

  const validateFieldMap: Record<
    keyof GapPricingFormData,
    (message: string) => Promise<void>
  > = {
    channel: (message) => validateFormFieldStore("channel", message),
    category: (message) => validateFormFieldStore("category", message),
    subcategory: (message) => validateFormFieldStore("subcategory", message),
    ideal_price: (message) => validateFormFieldStore("ideal_price", message),
    selling_price: (message) =>
      validateFormFieldStore("selling_price", message),
    fc_perc: (message) => validateFormFieldStore("fc_perc", message),
    mktg_spend: (message) => validateFormFieldStore("mktg_spend", message),
    notes: (message) => validateFormFieldStore("notes", message),
  };

  async function validateFormFieldStore(
    field: keyof GapPricingFormData,
    message: string,
  ) {
    await validateForm({ update: true });
    $errors[field] = [message];
  }

  function normalizeFieldOnBlur(
    field: "ideal_price" | "selling_price" | "mktg_spend",
  ) {
    $form[field] = normalizeMoneyInput($form[field]);
  }

  function normalizePercentFieldOnBlur() {
    $form.fc_perc = normalizePercentInput($form.fc_perc);
  }

  function moneyDisplay(value: number | null) {
    return value === null ? "-" : `EUR ${value.toFixed(2)}`;
  }
</script>

<svelte:head>
  <title>Fill Missing Pricing Data | Aggregator Offers Tool</title>
  <meta
    name="description"
    content="Resolve missing offer pricing data and submit updates for approval."
  />
</svelte:head>

<div class="relative isolate min-h-screen overflow-hidden">
  <div class="bg-background absolute inset-0 -z-20"></div>
  <div
    class="absolute inset-x-0 top-0 -z-10 h-[26rem] bg-[radial-gradient(circle_at_top_left,_color-mix(in_oklab,var(--color-chart-2)_16%,transparent),transparent_34%),radial-gradient(circle_at_92%_10%,_color-mix(in_oklab,var(--color-chart-1)_14%,transparent),transparent_28%)]"
  ></div>

  <main class="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
    <div
      class="flex flex-wrap items-center gap-2 text-xs tracking-[0.18em] text-zinc-500 uppercase"
    >
      <span>Gap list</span>
      <ChevronRightIcon class="size-3" />
      <span>Open gaps</span>
      <ChevronRightIcon class="size-3" />
      <span>Fill missing pricing</span>
    </div>

    <section class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-end">
      <div class="space-y-3">
        <Badge
          variant="outline"
          class="px-3 py-1 text-[0.7rem] tracking-[0.22em] uppercase"
        >
          Discount quality system
        </Badge>
        <div class="space-y-2">
          <h1
            class="text-4xl font-semibold tracking-[-0.05em] text-balance sm:text-5xl"
          >
            Fill missing pricing data
          </h1>
          <p class="text-muted-foreground max-w-3xl text-base leading-7">
            Review item context, complete the required pricing fields, and
            submit a staged correction for approval.
          </p>
        </div>
      </div>

      <Card.Root
        class="border-border/70 bg-background/90 shadow-sm backdrop-blur"
      >
        <Card.Content class="grid gap-3 p-5">
          <div>
            <p class="text-3xl font-semibold tracking-[-0.04em]">
              {missingCount}
            </p>
            <p class="text-muted-foreground text-sm">
              Field{missingCount === 1 ? "" : "s"} flagged missing
            </p>
          </div>
          <p class="text-muted-foreground text-sm leading-6">
            Approved values will be written to `dim_offers` after review.
          </p>
        </Card.Content>
      </Card.Root>
    </section>

    {#if missingCount > 0}
      <div
        class="border-destructive/20 bg-destructive/6 text-destructive flex items-start gap-3 rounded-2xl border px-4 py-4"
      >
        <TriangleAlertIcon class="mt-0.5 size-4 shrink-0" />
        <div class="space-y-1 text-sm">
          <p class="font-medium">
            {missingCount} field{missingCount === 1 ? " is" : "s are"} missing for
            this item.
          </p>
          <p class="text-destructive/80">
            {data.gap.missing_fields.join(", ")}
            {missingCount === 1 ? "is" : "are"} highlighted below. Discount calculation
            stays blocked until the missing values are resolved.
          </p>
        </div>
      </div>
    {/if}

    {#if serverError}
      <div
        class="border-destructive/20 bg-destructive/6 text-destructive rounded-2xl border px-4 py-3 text-sm"
      >
        {serverError}
      </div>
    {/if}

    {#if submitted}
      <Card.Root class="border-emerald-200 bg-emerald-50/80 shadow-sm">
        <Card.Content
          class="flex flex-col items-center gap-3 px-6 py-10 text-center"
        >
          <div
            class="flex size-12 items-center justify-center rounded-full border border-emerald-200 bg-white text-emerald-700"
          >
            <CheckCircle2Icon class="size-6" />
          </div>
          <div class="space-y-1">
            <p class="text-lg font-semibold tracking-[-0.02em]">
              Submitted for approval
            </p>
            <p class="text-muted-foreground text-sm">
              {data.gap.trde_item} · {data.gap.item_name} is now pending review.
            </p>
          </div>
          <p class="text-muted-foreground max-w-xl text-sm leading-6">
            The pricing update was written to `dim_offers_staging` and the gap
            is now marked as submitted.
          </p>
        </Card.Content>
      </Card.Root>
    {:else if isReviewMode && reviewSubmission}
      <div class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div class="grid gap-5">
          <Card.Root
            class="border-border/70 bg-background/90 overflow-hidden shadow-sm backdrop-blur"
          >
            <Card.Header class="bg-muted/45 gap-3 border-b">
              <div class="flex items-center justify-between gap-4">
                <div class="space-y-1">
                  <Card.Title class="text-base tracking-[0.18em] uppercase"
                    >Item context</Card.Title
                  >
                  <Card.Description
                    >Read-only context sourced from the detected gap and
                    ClickHouse transaction data.</Card.Description
                  >
                </div>
                <Badge variant="secondary">Review mode</Badge>
              </div>
            </Card.Header>
            <Card.Content class="space-y-5 p-6">
              <div class="flex flex-wrap gap-2">
                <Badge
                  variant="outline"
                  class="gap-2 px-3 py-1.5 font-mono text-[0.72rem]"
                >
                  Item code
                  <span class="text-primary">{data.gap.trde_item}</span>
                </Badge>
                <Badge
                  variant="outline"
                  class="gap-2 px-3 py-1.5 font-mono text-[0.72rem]"
                >
                  Brand
                  <span>{data.gap.brand}</span>
                </Badge>
                <Badge
                  variant="outline"
                  class="gap-2 px-3 py-1.5 font-mono text-[0.72rem]"
                >
                  Transaction category
                  <span>{data.gap.item_category}</span>
                </Badge>
                <Badge
                  variant="outline"
                  class="gap-2 px-3 py-1.5 font-mono text-[0.72rem]"
                >
                  Detected
                  <span>{detectedAt}</span>
                </Badge>
              </div>

              <div class="grid gap-4 sm:grid-cols-2">
                <div class="space-y-2">
                  <Label for="gap-review-item-name">Item name</Label>
                  <Input
                    id="gap-review-item-name"
                    value={data.gap.item_name}
                    disabled
                  />
                </div>
                <div class="space-y-2">
                  <Label for="gap-review-item-code">Item code</Label>
                  <Input
                    id="gap-review-item-code"
                    value={data.gap.trde_item}
                    disabled
                  />
                </div>
              </div>
            </Card.Content>
          </Card.Root>

          <Card.Root
            class="border-border/70 bg-background/90 overflow-hidden shadow-sm backdrop-blur"
          >
            <Card.Header class="bg-muted/45 gap-3 border-b">
              <Card.Title class="text-base tracking-[0.18em] uppercase"
                >Submitted values</Card.Title
              >
              <Card.Description>
                Review the pending pricing values before approving the
                ClickHouse write.
              </Card.Description>
            </Card.Header>
            <Card.Content class="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3">
              <div class="space-y-2">
                <Label>Channel</Label>
                <Input value={reviewSubmission.channel} disabled />
              </div>
              <div class="space-y-2">
                <Label>Category</Label>
                <Input value={reviewSubmission.category} disabled />
              </div>
              <div class="space-y-2">
                <Label>Subcategory</Label>
                <Input value={reviewSubmission.subcategory} disabled />
              </div>
              <div class="space-y-2">
                <Label>Ideal price</Label>
                <Input value={`EUR ${reviewSubmission.ideal_price}`} disabled />
              </div>
              <div class="space-y-2">
                <Label>Selling price</Label>
                <Input
                  value={`EUR ${reviewSubmission.selling_price}`}
                  disabled
                />
              </div>
              <div class="space-y-2">
                <Label>FC %</Label>
                <Input value={`${reviewSubmission.fc_perc}%`} disabled />
              </div>
              <div class="space-y-2">
                <Label>Marketing spend</Label>
                <Input
                  value={reviewSubmission.mktg_spend
                    ? `EUR ${reviewSubmission.mktg_spend}`
                    : "-"}
                  disabled
                />
              </div>
              <div class="space-y-2 sm:col-span-2">
                <Label>Notes</Label>
                <Textarea
                  value={reviewSubmission.notes ?? "-"}
                  disabled
                  rows={4}
                />
              </div>
            </Card.Content>
          </Card.Root>

          <Card.Root
            class="border-border/70 bg-background/90 overflow-hidden shadow-sm backdrop-blur"
          >
            <Card.Header class="bg-muted/45 gap-3 border-b">
              <Card.Title class="text-base tracking-[0.18em] uppercase"
                >Current vs submitted</Card.Title
              >
              <Card.Description>
                Compare the current `dim_offers` values with the staged
                submission before deciding.
              </Card.Description>
            </Card.Header>
            <Card.Content class="p-0">
              <div class="overflow-x-auto">
                <table class="w-full min-w-[36rem] text-sm">
                  <thead class="bg-muted/35 text-muted-foreground">
                    <tr>
                      <th class="px-6 py-3 text-left font-medium">Field</th>
                      <th class="px-6 py-3 text-left font-medium">Current</th>
                      <th class="px-6 py-3 text-left font-medium">Submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each currentDimOfferRows as row}
                      <tr class="border-t align-top">
                        <td class="px-6 py-4 font-medium">{row.label}</td>
                        <td class="text-muted-foreground px-6 py-4"
                          >{row.current}</td
                        >
                        <td class="px-6 py-4">
                          <div class="flex items-center gap-2">
                            <span>{row.proposed}</span>
                            {#if row.current !== row.proposed}
                              <Badge variant="secondary">Changed</Badge>
                            {/if}
                          </div>
                        </td>
                      </tr>
                    {/each}
                    <tr class="border-t align-top">
                      <td class="px-6 py-4 font-medium">Notes</td>
                      <td class="text-muted-foreground px-6 py-4">-</td>
                      <td class="px-6 py-4">{reviewSubmission.notes ?? "-"}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Card.Content>
          </Card.Root>
        </div>

        <Card.Root
          class="border-border/70 bg-background/90 sticky top-24 h-fit shadow-sm backdrop-blur"
        >
          <Card.Header class="bg-muted/45 gap-3 border-b">
            <div class="flex items-center gap-2">
              <ShieldCheckIcon class="size-4" />
              <Card.Title class="text-base tracking-[0.18em] uppercase"
                >Approver actions</Card.Title
              >
            </div>
            <Card.Description>
              Approving submits the ClickHouse write and resolves the gap.
              Rejecting reopens it.
            </Card.Description>
          </Card.Header>
          <Card.Content class="space-y-4 p-6">
            <div
              class="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-sm leading-6"
            >
              <p class="font-medium">Pending submission</p>
              <p class="text-muted-foreground mt-1">
                Submitted by `{reviewSubmission.submitted_by}` on
                {new Date(reviewSubmission.submitted_at).toLocaleString()}.
              </p>
            </div>

            <div class="space-y-3">
              <Button
                class="w-full"
                disabled={approvalSubmitting !== null}
                onclick={() => handleApprovalDecision("approve")}
              >
                {#if approvalSubmitting === "approve"}
                  <LoaderCircleIcon class="mr-2 size-4 animate-spin" />
                  Approving...
                {:else}
                  Approve submission
                {/if}
              </Button>
              <Button
                variant="outline"
                class="border-destructive/30 text-destructive hover:bg-destructive/6 w-full"
                disabled={approvalSubmitting !== null}
                onclick={() => handleApprovalDecision("reject")}
              >
                {#if approvalSubmitting === "reject"}
                  <LoaderCircleIcon class="mr-2 size-4 animate-spin" />
                  Rejecting...
                {:else}
                  Reject submission
                {/if}
              </Button>
            </div>
          </Card.Content>
        </Card.Root>
      </div>
    {:else}
      <div class="grid gap-5">
        <Card.Root
          class="border-border/70 bg-background/90 overflow-hidden shadow-sm backdrop-blur"
        >
          <Card.Header class="bg-muted/45 gap-3 border-b">
            <div class="flex items-center justify-between gap-4">
              <div class="space-y-1">
                <Card.Title class="text-base tracking-[0.18em] uppercase"
                  >Item context</Card.Title
                >
                <Card.Description
                  >Read-only context sourced from the detected gap and
                  ClickHouse transaction data.</Card.Description
                >
              </div>
              <Badge variant="secondary">Read-only</Badge>
            </div>
          </Card.Header>
          <Card.Content class="space-y-5 p-6">
            <div class="flex flex-wrap gap-2">
              <Badge
                variant="outline"
                class="gap-2 px-3 py-1.5 font-mono text-[0.72rem]"
              >
                Item code
                <span class="text-primary">{data.gap.trde_item}</span>
              </Badge>
              <Badge
                variant="outline"
                class="gap-2 px-3 py-1.5 font-mono text-[0.72rem]"
              >
                Brand
                <span>{data.gap.brand}</span>
              </Badge>
              <Badge
                variant="outline"
                class="gap-2 px-3 py-1.5 font-mono text-[0.72rem]"
              >
                Transaction category
                <span>{data.gap.item_category}</span>
              </Badge>
              <Badge
                variant="outline"
                class="gap-2 px-3 py-1.5 font-mono text-[0.72rem]"
              >
                Detected
                <span>{detectedAt}</span>
              </Badge>
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <div class="space-y-2">
                <Label for="gap-item-name">Item name</Label>
                <Input id="gap-item-name" value={data.gap.item_name} disabled />
              </div>
              <div class="space-y-2">
                <Label for="gap-item-code">Item code</Label>
                <Input id="gap-item-code" value={data.gap.trde_item} disabled />
              </div>
            </div>
          </Card.Content>
        </Card.Root>

        <Card.Root
          class="border-border/70 bg-background/90 overflow-hidden shadow-sm backdrop-blur"
        >
          <Card.Header class="bg-muted/45 gap-3 border-b">
            <Card.Title class="text-base tracking-[0.18em] uppercase"
              >Pricing submission</Card.Title
            >
            <Card.Description>
              Complete the required pricing fields and submit the correction for
              approval.
            </Card.Description>
          </Card.Header>

          <Card.Content class="space-y-8 p-6">
            <section class="space-y-4">
              <div class="space-y-1">
                <p
                  class="text-muted-foreground font-mono text-[0.72rem] tracking-[0.18em] uppercase"
                >
                  Channel
                </p>
                <p class="text-muted-foreground text-sm">
                  Select the sales channel that should be stored in
                  `dim_offers`.
                </p>
              </div>

              <div class="space-y-2">
                <Label for="gap-channel">Channel</Label>
                <NativeSelect.Root
                  id="gap-channel"
                  class="w-full"
                  bind:value={$form.channel}
                  aria-required="true"
                  aria-invalid={!!$errors.channel}
                >
                  <NativeSelect.Option value=""
                    >Select a channel...</NativeSelect.Option
                  >
                  {#each data.channels as option}
                    <NativeSelect.Option value={option.name}
                      >{option.name}</NativeSelect.Option
                    >
                  {/each}
                </NativeSelect.Root>
                {#if $errors.channel}
                  <p class="text-destructive text-sm">{$errors.channel}</p>
                {/if}
              </div>
            </section>

            <Separator />

            <section class="space-y-4">
              <div class="space-y-1">
                <p
                  class="text-muted-foreground font-mono text-[0.72rem] tracking-[0.18em] uppercase"
                >
                  Category and subcategory
                </p>
                <p class="text-muted-foreground text-sm">
                  Subcategory options are loaded dynamically from the selected
                  category.
                </p>
              </div>

              <div class="grid gap-4 sm:grid-cols-2">
                <div class="space-y-2">
                  <Label for="gap-category">Category</Label>
                  <NativeSelect.Root
                    id="gap-category"
                    class="w-full"
                    bind:value={$form.category}
                    aria-required="true"
                    aria-invalid={!!$errors.category}
                  >
                    <NativeSelect.Option value=""
                      >Select a category...</NativeSelect.Option
                    >
                    {#each data.categories as option}
                      <NativeSelect.Option value={option.name}
                        >{option.name}</NativeSelect.Option
                      >
                    {/each}
                  </NativeSelect.Root>
                  {#if $errors.category}
                    <p class="text-destructive text-sm">{$errors.category}</p>
                  {/if}
                </div>

                <div class="space-y-2">
                  <div class="flex items-center justify-between gap-2">
                    <Label for="gap-subcategory">Subcategory</Label>
                    {#if subcategoryLoading}
                      <span
                        class="text-muted-foreground inline-flex items-center gap-1 text-xs"
                      >
                        <LoaderCircleIcon class="size-3 animate-spin" /> Loading
                      </span>
                    {/if}
                  </div>
                  <NativeSelect.Root
                    id="gap-subcategory"
                    class="w-full"
                    bind:value={$form.subcategory}
                    disabled={subcategoryDisabled}
                    aria-required="true"
                    aria-invalid={!!$errors.subcategory}
                    title={!$form.category
                      ? "Select a category first"
                      : undefined}
                  >
                    <NativeSelect.Option value="">
                      {!$form.category
                        ? "Select a category first..."
                        : "Select a subcategory..."}
                    </NativeSelect.Option>
                    {#each subcategoryOptions as option}
                      <NativeSelect.Option value={option.name}
                        >{option.name}</NativeSelect.Option
                      >
                    {/each}
                  </NativeSelect.Root>
                  {#if $errors.subcategory}
                    <p class="text-destructive text-sm">
                      {$errors.subcategory}
                    </p>
                  {/if}
                </div>
              </div>

              <div
                class="border-primary/15 bg-primary/6 text-primary rounded-xl border px-4 py-3 text-sm leading-6"
              >
                Changing the category resets the subcategory list and reloads
                the valid options from the backend.
              </div>
            </section>

            <Separator />

            <section class="space-y-5">
              <div class="space-y-1">
                <p
                  class="text-muted-foreground font-mono text-[0.72rem] tracking-[0.18em] uppercase"
                >
                  Pricing fields
                </p>
                <p class="text-muted-foreground text-sm">
                  Fields marked as missing must be filled before the submission
                  can proceed.
                </p>
              </div>

              <div class="grid gap-4 lg:grid-cols-3">
                <div class="space-y-2">
                  <div class="flex items-center gap-2">
                    <Label for="gap-ideal-price">Ideal price</Label>
                    {#if missingFields.has("ideal_price")}
                      <Badge variant="destructive">Missing</Badge>
                    {/if}
                  </div>
                  <div class="relative">
                    <span
                      class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm"
                      >EUR</span
                    >
                    <Input
                      id="gap-ideal-price"
                      name="ideal_price"
                      type="number"
                      step="0.01"
                      min="0.01"
                      class={`pl-12 ${missingFields.has("ideal_price") ? "border-destructive/60 ring-destructive/8 bg-destructive/5" : ""}`}
                      bind:value={$form.ideal_price}
                      onblur={() => normalizeFieldOnBlur("ideal_price")}
                      aria-required="true"
                      aria-invalid={!!$errors.ideal_price}
                      {...$constraints.ideal_price}
                    />
                  </div>
                  <p class="text-muted-foreground text-xs">
                    Full reference price. Must be greater than 0.
                  </p>
                  {#if $errors.ideal_price}
                    <p class="text-destructive text-sm">
                      {$errors.ideal_price}
                    </p>
                  {/if}
                </div>

                <div class="space-y-2">
                  <div class="flex items-center gap-2">
                    <Label for="gap-selling-price">Selling price</Label>
                    {#if missingFields.has("selling_price")}
                      <Badge variant="destructive">Missing</Badge>
                    {/if}
                  </div>
                  <div class="relative">
                    <span
                      class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm"
                      >EUR</span
                    >
                    <Input
                      id="gap-selling-price"
                      name="selling_price"
                      type="number"
                      step="0.01"
                      min="0"
                      class={`pl-12 ${missingFields.has("selling_price") ? "border-destructive/60 ring-destructive/8 bg-destructive/5" : ""}`}
                      bind:value={$form.selling_price}
                      onblur={() => normalizeFieldOnBlur("selling_price")}
                      aria-required="true"
                      aria-invalid={!!$errors.selling_price}
                      {...$constraints.selling_price}
                    />
                  </div>
                  <p class="text-muted-foreground text-xs">
                    Can be zero, but cannot exceed ideal price.
                  </p>
                  {#if $errors.selling_price}
                    <p class="text-destructive text-sm">
                      {$errors.selling_price}
                    </p>
                  {/if}
                </div>

                <div class="space-y-2">
                  <div class="flex items-center gap-2">
                    <Label for="gap-fc-perc">FC %</Label>
                    {#if missingFields.has("fc_perc")}
                      <Badge variant="destructive">Missing</Badge>
                    {/if}
                  </div>
                  <div class="relative">
                    <Input
                      id="gap-fc-perc"
                      name="fc_perc"
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      class={`pr-10 ${missingFields.has("fc_perc") ? "border-destructive/60 ring-destructive/8 bg-destructive/5" : ""}`}
                      bind:value={$form.fc_perc}
                      onblur={normalizePercentFieldOnBlur}
                      aria-required="true"
                      aria-invalid={!!$errors.fc_perc}
                      {...$constraints.fc_perc}
                    />
                    <span
                      class="text-muted-foreground pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm"
                      >%</span
                    >
                  </div>
                  <p class="text-muted-foreground text-xs">
                    Shown as a percentage. The API stores it as a fraction.
                  </p>
                  {#if $errors.fc_perc}
                    <p class="text-destructive text-sm">{$errors.fc_perc}</p>
                  {/if}
                </div>
              </div>

              <div
                class="border-border bg-muted/35 flex flex-col justify-between gap-4 rounded-2xl border px-4 py-4 sm:flex-row sm:items-center"
              >
                <div>
                  <p
                    class="font-mono text-[0.72rem] tracking-[0.18em] text-zinc-500 uppercase"
                  >
                    Calculated output
                  </p>
                  <p class="text-muted-foreground mt-1 text-sm">
                    `discount_amount` is derived as `ideal_price -
                    selling_price` and is never user-entered.
                  </p>
                </div>
                <div class="text-right">
                  <p class="text-2xl font-semibold tracking-[-0.04em]">
                    {discountPreview ? `EUR ${discountPreview}` : "-"}
                  </p>
                </div>
              </div>

              <div class="grid gap-4 sm:grid-cols-2">
                <div class="space-y-2">
                  <Label for="gap-mktg-spend">Marketing spend</Label>
                  <div class="relative">
                    <span
                      class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm"
                      >EUR</span
                    >
                    <Input
                      id="gap-mktg-spend"
                      name="mktg_spend"
                      type="number"
                      step="0.01"
                      min="0"
                      class="pl-12"
                      bind:value={$form.mktg_spend}
                      onblur={() => normalizeFieldOnBlur("mktg_spend")}
                      aria-invalid={!!$errors.mktg_spend}
                      {...$constraints.mktg_spend}
                    />
                  </div>
                  <p class="text-muted-foreground text-xs">
                    Optional. Leave blank if there is no spend to record.
                  </p>
                  {#if $errors.mktg_spend}
                    <p class="text-destructive text-sm">{$errors.mktg_spend}</p>
                  {/if}
                </div>

                <div class="space-y-2">
                  <div class="flex items-center justify-between gap-2">
                    <Label for="gap-notes">Notes</Label>
                    <span
                      class={`font-mono text-xs ${notesCount > 480 ? "text-destructive" : "text-muted-foreground"}`}
                    >
                      {notesCount}/500
                    </span>
                  </div>
                  <Textarea
                    id="gap-notes"
                    name="notes"
                    rows={4}
                    placeholder="Sourced from pricing sheet v3, approved by category manager..."
                    bind:value={$form.notes}
                    aria-invalid={!!$errors.notes}
                    {...$constraints.notes}
                  />
                  {#if $errors.notes}
                    <p class="text-destructive text-sm">{$errors.notes}</p>
                  {/if}
                </div>
              </div>
            </section>
          </Card.Content>

          <div class="bg-muted/45 border-t px-6 py-4">
            <div
              class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <p class="text-muted-foreground text-sm">
                Submitting writes to `dim_offers_staging` and marks the gap as
                submitted.
              </p>
              <div class="flex flex-col-reverse gap-2 sm:flex-row">
                <Button
                  variant="outline"
                  href="/offers-data-quality"
                  disabled={$submitting}>Discard</Button
                >
                <Button
                  onclick={submitPricingForm}
                  disabled={$submitting || subcategoryLoading}
                >
                  {#if $submitting}
                    <LoaderCircleIcon class="mr-2 size-4 animate-spin" />
                    Submitting...
                  {:else}
                    Submit for approval
                  {/if}
                </Button>
              </div>
            </div>
          </div>
        </Card.Root>
      </div>
    {/if}
  </main>
</div>
