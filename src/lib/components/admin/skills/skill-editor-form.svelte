<script lang="ts">
  import { untrack } from "svelte";
  import type { SuperValidated } from "sveltekit-superforms";
  import { zod4Client } from "sveltekit-superforms/adapters";
  import { superForm } from "sveltekit-superforms/client";
  import { toast } from "svelte-sonner";
  import * as Alert from "$lib/components/ui/alert/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button, buttonVariants } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import { Textarea } from "$lib/components/ui/textarea/index.js";
  import ChevronsUpDownIcon from "@lucide/svelte/icons/chevrons-up-down";
  import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
  import SparklesIcon from "@lucide/svelte/icons/sparkles";
  import type { AssistantId } from "$lib/services/skills/assistants";
  import {
    MAX_REFERENCE_FILES,
    MAX_TAGS,
    SKILL_DESCRIPTION_MAX_LENGTH,
    SKILL_MAX_LINES,
    SKILL_MAX_TOKENS,
    SKILL_NAME_MAX_LENGTH,
    countLines,
    createSkillFormSchema,
    editSkillFormSchema,
    estimateTokens,
    getDefaultSkillFormData,
    type CreateSkillFormData,
    type EditSkillFormData,
    type SkillActionMessage,
    type SkillEditorData,
    type SkillFormData,
  } from "$lib/services/skills/skill-editor-form";
  import { renderSkillMarkdown } from "$lib/services/skills/skill-markdown";

  type AssistantOption = { readonly id: AssistantId; readonly label: string };

  type Props = {
    form:
      | SuperValidated<CreateSkillFormData>
      | SuperValidated<EditSkillFormData>;
    mode: "create" | "edit";
    action: string;
    assistants: readonly AssistantOption[];
    /** Git-tracked skills under workspace/skills (names are reserved). */
    builtInNames: string[];
    /** Names of the other skills the viewer can see (the server checks the rest). */
    existingNames: string[];
    values?: SkillFormData;
    skillId?: number | null;
    onSuccess?: (message: SkillActionMessage) => void;
  };

  let {
    form: initialForm,
    mode,
    action,
    assistants,
    builtInNames,
    existingNames,
    values = getDefaultSkillFormData(),
    skillId = null,
    onSuccess,
  }: Props = $props();

  // `mode` never changes after mount (the page remounts the editor per dialog).
  const schema = untrack(() =>
    mode === "create" ? createSkillFormSchema : editSkillFormSchema,
  );

  // svelte-ignore state_referenced_locally
  const { form, errors, enhance, submitting, message } = superForm(
    untrack(() => initialForm),
    {
      // Nested arrays (reference files, tags, assistants) post as one JSON
      // payload instead of flat FormData keys.
      dataType: "json",
      applyAction: true,
      invalidateAll: true,
      resetForm: mode === "create",
      id: mode === "create" ? "create-skill" : "edit-skill",
      validators: zod4Client(schema),
      onUpdated: ({ form }) => {
        if (form.valid && form.message) {
          onSuccess?.(form.message as SkillActionMessage);
        }
      },
    },
  );

  // Load the row being edited (deep copies so edits never touch page data).
  $effect(() => {
    const next = values;
    $form.name = next.name;
    $form.description = next.description;
    $form.instructions = next.instructions;
    $form.userInvocable = next.userInvocable;
    $form.tags = [...next.tags];
    $form.referenceFiles = next.referenceFiles.map((file) => ({ ...file }));
    $form.agentIds = [...next.agentIds];
    if (mode === "edit") {
      ($form as EditSkillFormData).id = skillId ?? 0;
    }
  });

  type FieldErrors = {
    name?: string[];
    description?: string[];
    instructions?: string[];
    tags?: { _errors?: string[] };
    agentIds?: { _errors?: string[] };
    referenceFiles?: {
      _errors?: string[];
      [index: number]: { filename?: string[]; content?: string[] } | undefined;
    };
  };
  const fieldErrors = $derived($errors as unknown as FieldErrors);

  const actionErrorMessage = $derived(
    $message && ($message as SkillActionMessage).type === "error"
      ? ($message as SkillActionMessage).text
      : null,
  );

  const takenNames = $derived(
    new Set(
      [...builtInNames, ...existingNames].filter(
        (name) => name !== values.name,
      ),
    ),
  );
  const nameTakenError = $derived(
    takenNames.has($form.name.trim())
      ? builtInNames.includes($form.name.trim())
        ? "That name belongs to a built-in skill"
        : "That name is already used by another skill"
      : null,
  );

  const rendered = $derived(renderSkillMarkdown($form as SkillEditorData));
  const lineCount = $derived(countLines($form.instructions));
  const tokenEstimate = $derived(estimateTokens($form.instructions));
  const instructionsLong = $derived(
    lineCount > SKILL_MAX_LINES || tokenEstimate > SKILL_MAX_TOKENS,
  );

  let tab = $state("details");
  let tagInput = $state("");
  let assistantPickerOpen = $state(false);
  let enhancing = $state<"description" | "instructions" | null>(null);

  function addTag() {
    const tag = tagInput.trim();
    if (tag && !$form.tags.includes(tag) && $form.tags.length < MAX_TAGS) {
      $form.tags = [...$form.tags, tag];
    }
    tagInput = "";
  }

  function removeTag(tag: string) {
    $form.tags = $form.tags.filter((existing) => existing !== tag);
  }

  function isAssistantSelected(id: AssistantId): boolean {
    return $form.agentIds.includes(id);
  }

  function toggleAssistant(id: AssistantId) {
    $form.agentIds = isAssistantSelected(id)
      ? $form.agentIds.filter((existing) => existing !== id)
      : [...$form.agentIds, id];
  }

  const assistantSummary = $derived.by(() => {
    if ($form.agentIds.length === 0) return "Select assistants";
    const labels = $form.agentIds.map(
      (id) => assistants.find((assistant) => assistant.id === id)?.label ?? id,
    );
    return labels.length <= 2
      ? labels.join(", ")
      : `${labels.length} assistants selected`;
  });

  function addReference() {
    if ($form.referenceFiles.length >= MAX_REFERENCE_FILES) return;
    $form.referenceFiles = [
      ...$form.referenceFiles,
      { filename: "", content: "" },
    ];
  }

  function removeReference(index: number) {
    $form.referenceFiles = $form.referenceFiles.filter((_, i) => i !== index);
  }

  async function enhanceField(field: "description" | "instructions") {
    const previous = $form[field];
    if (!previous.trim() || enhancing) return;
    enhancing = field;
    try {
      const response = await fetch("/api/admin/skills/enhance", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          field,
          text: previous,
          name: $form.name,
          description: $form.description,
          instructions: $form.instructions,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(body?.message ?? `Enhance failed (${response.status})`);
      }
      const { text } = (await response.json()) as { text: string };
      $form[field] = text;
      toast.success(
        field === "description"
          ? "Description enhanced."
          : "Instructions enhanced.",
        {
          action: {
            label: "Undo",
            onClick: () => {
              $form[field] = previous;
            },
          },
        },
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not enhance the text.",
      );
    } finally {
      enhancing = null;
    }
  }

  const canSubmit = $derived(!$submitting && !nameTakenError);
  const fieldId = (name: string) => `${mode}-skill-${name}`;
</script>

<form method="POST" {action} use:enhance class="flex flex-col gap-4">
  <div class="grid gap-6 lg:grid-cols-[3fr_2fr]">
    <Tabs.Root bind:value={tab}>
      <Tabs.List>
        <Tabs.Trigger value="details">Details</Tabs.Trigger>
        <Tabs.Trigger value="instructions">Instructions</Tabs.Trigger>
        <Tabs.Trigger value="references">
          References ({$form.referenceFiles.length})
        </Tabs.Trigger>
      </Tabs.List>

      <Tabs.Content value="details" class="flex flex-col gap-5 pt-4">
        <div class="space-y-1.5">
          <Label for={fieldId("name")}>Name</Label>
          <Input
            id={fieldId("name")}
            bind:value={$form.name}
            autocomplete="off"
            aria-invalid={!!fieldErrors.name || !!nameTakenError}
            placeholder="store-opening-hours"
          />
          <p class="text-muted-foreground text-sm">
            Folder and frontmatter name. Lowercase letters, digits and single
            hyphens, up to {SKILL_NAME_MAX_LENGTH} characters. Cannot match a built-in
            skill.
          </p>
          {#if fieldErrors.name?.[0]}
            <p class="text-destructive text-sm">{fieldErrors.name[0]}</p>
          {:else if nameTakenError}
            <p class="text-destructive text-sm">{nameTakenError}</p>
          {/if}
        </div>

        <div class="space-y-1.5">
          <div class="flex items-center justify-between gap-2">
            <Label for={fieldId("description")}>Description</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              class="h-7 gap-1 px-2 text-xs"
              disabled={!$form.description.trim() || enhancing !== null}
              onclick={() => enhanceField("description")}
              title="Rewrite with AI"
            >
              {#if enhancing === "description"}
                <LoaderCircleIcon class="size-3 animate-spin" />
              {:else}
                <SparklesIcon class="size-3" />
              {/if}
              AI
            </Button>
          </div>
          <Textarea
            id={fieldId("description")}
            rows={3}
            disabled={enhancing === "description"}
            bind:value={$form.description}
            aria-invalid={!!fieldErrors.description}
          />
          <div class="flex items-start justify-between gap-4">
            <p class="text-muted-foreground text-sm">
              One or two sentences saying what the skill does and when to use
              it. Assistants read only this line when deciding whether to load
              the skill. AI rewrites your draft; Undo is in the toast.
            </p>
            <span class="text-muted-foreground shrink-0 text-xs">
              {$form.description.length}/{SKILL_DESCRIPTION_MAX_LENGTH}
            </span>
          </div>
          {#if fieldErrors.description?.[0]}
            <p class="text-destructive text-sm">{fieldErrors.description[0]}</p>
          {/if}
        </div>

        <div class="space-y-1.5">
          <div class="flex items-center justify-between gap-3">
            <Label id={fieldId("assistants-label")}>Assistants</Label>
            <span class="text-muted-foreground text-xs">
              Only the selected assistants can load this skill
            </span>
          </div>
          <Popover.Root bind:open={assistantPickerOpen}>
            <Popover.Trigger
              aria-labelledby={fieldId("assistants-label")}
              aria-invalid={!!fieldErrors.agentIds?._errors?.length}
              class={`${buttonVariants({ variant: "outline" })} w-full justify-between font-normal`}
            >
              <span class="truncate">{assistantSummary}</span>
              <ChevronsUpDownIcon class="size-4 shrink-0 opacity-60" />
            </Popover.Trigger>
            <Popover.Content
              align="start"
              class="w-[var(--bits-popover-anchor-width)] min-w-[20rem] p-0"
            >
              <div class="flex flex-col">
                <div
                  class="flex items-center justify-between gap-2 border-b px-4 py-2"
                >
                  <button
                    type="button"
                    class="text-sm font-medium underline-offset-4 hover:underline"
                    onclick={() =>
                      ($form.agentIds = assistants.map((a) => a.id))}
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    class="text-muted-foreground hover:text-foreground text-sm font-medium underline-offset-4 hover:underline"
                    onclick={() => ($form.agentIds = [])}
                  >
                    Clear
                  </button>
                </div>
                <div class="max-h-80 overflow-y-auto px-2 py-2">
                  {#each assistants as assistant (assistant.id)}
                    <button
                      type="button"
                      class="hover:bg-accent/50 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors"
                      onclick={() => toggleAssistant(assistant.id)}
                    >
                      <Checkbox
                        checked={isAssistantSelected(assistant.id)}
                        class="pointer-events-none"
                      />
                      <div class="min-w-0">
                        <p class="truncate text-sm leading-none font-medium">
                          {assistant.label}
                        </p>
                        <p class="text-muted-foreground mt-1 truncate text-xs">
                          {assistant.id}
                        </p>
                      </div>
                    </button>
                  {/each}
                </div>
                <div
                  class="flex items-center justify-between gap-2 border-t px-4 py-3"
                >
                  <p class="text-muted-foreground text-xs">
                    {$form.agentIds.length} selected
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    onclick={() => (assistantPickerOpen = false)}
                  >
                    Done
                  </Button>
                </div>
              </div>
            </Popover.Content>
          </Popover.Root>
          {#if $form.agentIds.length > 0}
            <div class="flex flex-wrap items-center gap-1">
              {#each $form.agentIds as id (id)}
                <Badge variant="secondary">
                  {assistants.find((a) => a.id === id)?.label ?? id}
                </Badge>
              {/each}
            </div>
          {/if}
          {#if fieldErrors.agentIds?._errors?.[0]}
            <p class="text-destructive text-sm">
              {fieldErrors.agentIds._errors[0]}
            </p>
          {/if}
        </div>

        <div class="flex items-start gap-3">
          <Checkbox
            id={fieldId("invocable")}
            checked={$form.userInvocable}
            onCheckedChange={(checked) =>
              ($form.userInvocable = checked === true)}
          />
          <div class="flex flex-col gap-1">
            <Label for={fieldId("invocable")}>User-invocable</Label>
            <p class="text-muted-foreground text-sm">
              Allow users to ask for the skill by name. Leave on unless the
              skill is only meant to be chosen by the assistant.
            </p>
          </div>
        </div>

        <div class="space-y-1.5">
          <Label for={fieldId("tags")}>Tags</Label>
          <div class="flex items-center gap-2">
            <Input
              id={fieldId("tags")}
              bind:value={tagInput}
              autocomplete="off"
              placeholder="Add a tag and press Enter"
              onkeydown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addTag();
                }
              }}
            />
            <Button type="button" variant="outline" size="sm" onclick={addTag}>
              Add
            </Button>
          </div>
          {#if $form.tags.length > 0}
            <div class="flex flex-wrap items-center gap-1">
              {#each $form.tags as tag (tag)}
                <Badge variant="secondary" class="gap-1">
                  {tag}
                  <button
                    type="button"
                    class="leading-none"
                    aria-label={`Remove tag ${tag}`}
                    onclick={() => removeTag(tag)}
                  >
                    ×
                  </button>
                </Badge>
              {/each}
            </div>
          {/if}
          <p class="text-muted-foreground text-sm">
            Optional labels stored under metadata.tags (up to {MAX_TAGS}).
          </p>
        </div>
      </Tabs.Content>

      <Tabs.Content value="instructions" class="flex flex-col gap-4 pt-4">
        <div class="space-y-1.5">
          <div class="flex items-center justify-between gap-2">
            <Label for={fieldId("instructions")}>Instructions</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              class="h-7 gap-1 px-2 text-xs"
              disabled={!$form.instructions.trim() || enhancing !== null}
              onclick={() => enhanceField("instructions")}
              title="Rewrite with AI"
            >
              {#if enhancing === "instructions"}
                <LoaderCircleIcon class="size-3 animate-spin" />
              {:else}
                <SparklesIcon class="size-3" />
              {/if}
              AI
            </Button>
          </div>
          <Textarea
            id={fieldId("instructions")}
            class="font-mono"
            rows={24}
            disabled={enhancing === "instructions"}
            bind:value={$form.instructions}
            aria-invalid={!!fieldErrors.instructions}
          />
          <p class="text-muted-foreground text-sm">
            Markdown the assistant follows once the skill is loaded. Put the
            workflow here; move long tables, SQL and examples into reference
            files. AI rewrites your draft; Undo is in the toast.
          </p>
          <p class="text-muted-foreground text-xs">
            {lineCount} lines · ~{tokenEstimate} tokens (Mastra recommends under
            {SKILL_MAX_LINES} lines and {SKILL_MAX_TOKENS} tokens)
          </p>
          {#if fieldErrors.instructions?.[0]}
            <p class="text-destructive text-sm">
              {fieldErrors.instructions[0]}
            </p>
          {/if}
        </div>
        {#if instructionsLong}
          <Alert.Root variant="destructive">
            <Alert.Title>Instructions are long</Alert.Title>
            <Alert.Description>
              Mastra will warn when loading this skill. Move detail into a
              reference file; assistants read those only when needed.
            </Alert.Description>
          </Alert.Root>
        {/if}
      </Tabs.Content>

      <Tabs.Content value="references" class="flex flex-col gap-4 pt-4">
        <p class="text-muted-foreground text-sm">
          Optional Markdown files under references/. Assistants list them when
          the skill loads and read one with skill_read when needed.
        </p>
        {#if fieldErrors.referenceFiles?._errors?.[0]}
          <p class="text-destructive text-sm">
            {fieldErrors.referenceFiles._errors[0]}
          </p>
        {/if}
        {#each $form.referenceFiles as _, i (i)}
          {@const refErrors = fieldErrors.referenceFiles?.[i]}
          <div class="flex flex-col gap-3 rounded-md border p-3">
            <div class="space-y-1.5">
              <Label for={fieldId(`ref-name-${i}`)}>Filename</Label>
              <Input
                id={fieldId(`ref-name-${i}`)}
                bind:value={$form.referenceFiles[i].filename}
                placeholder="lowercase-with-dashes.md"
                autocomplete="off"
                aria-invalid={!!refErrors?.filename}
              />
              {#if refErrors?.filename?.[0]}
                <p class="text-destructive text-sm">{refErrors.filename[0]}</p>
              {/if}
            </div>
            <div class="space-y-1.5">
              <Label for={fieldId(`ref-content-${i}`)}>Content</Label>
              <Textarea
                id={fieldId(`ref-content-${i}`)}
                class="font-mono"
                rows={10}
                bind:value={$form.referenceFiles[i].content}
                aria-invalid={!!refErrors?.content}
              />
              {#if refErrors?.content?.[0]}
                <p class="text-destructive text-sm">{refErrors.content[0]}</p>
              {/if}
            </div>
            <div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onclick={() => removeReference(i)}
              >
                Remove
              </Button>
            </div>
          </div>
        {/each}
        <div>
          <Button
            type="button"
            variant="outline"
            disabled={$form.referenceFiles.length >= MAX_REFERENCE_FILES}
            onclick={addReference}
          >
            Add reference file
          </Button>
        </div>
      </Tabs.Content>
    </Tabs.Root>

    <div class="flex flex-col gap-4">
      <Card.Root>
        <Card.Header>
          <Card.Title>Preview</Card.Title>
          <Card.Description>
            What will be written to SKILL.md for each selected assistant
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <pre
            class="bg-muted max-h-[60vh] overflow-auto rounded-md p-3 font-mono text-xs whitespace-pre-wrap">{rendered}</pre>
        </Card.Content>
      </Card.Root>
      {#each $form.referenceFiles as file, i (i)}
        <details class="rounded-md border p-2">
          <summary class="cursor-pointer text-sm">
            references/{file.filename || "(unnamed)"}
          </summary>
          <pre
            class="bg-muted mt-2 max-h-[40vh] overflow-auto rounded-md p-3 font-mono text-xs whitespace-pre-wrap">{file.content}</pre>
        </details>
      {/each}
    </div>
  </div>

  {#if actionErrorMessage}
    <Alert.Root variant="destructive">
      <Alert.Title>Could not save skill</Alert.Title>
      <Alert.Description>{actionErrorMessage}</Alert.Description>
    </Alert.Root>
  {/if}

  <div class="flex justify-end gap-2">
    <Button type="submit" disabled={!canSubmit}>
      {#if $submitting}
        <LoaderCircleIcon class="size-4 animate-spin" />
      {/if}
      {mode === "create" ? "Create skill" : "Save changes"}
    </Button>
  </div>
</form>
