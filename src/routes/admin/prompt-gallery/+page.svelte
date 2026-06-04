<script lang="ts">
  import { toast } from "svelte-sonner";
  import { zod4Client } from "sveltekit-superforms/adapters";
  import { superForm } from "sveltekit-superforms/client";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import FolderPenIcon from "@lucide/svelte/icons/folder-pen";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";
  import {
    createCategoryFormSchema,
    deleteCategoryFormSchema,
    renameCategoryFormSchema,
    type PromptGalleryActionMessage,
  } from "$lib/services/inspiration/category-form";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const categories = $derived(data.categories);

  let createOpen = $state(false);
  let renameOpen = $state(false);
  let deleteOpen = $state(false);
  let renameTarget = $state<{ slug: string; name: string } | null>(null);
  let deleteTarget = $state<{ slug: string; name: string } | null>(null);

  function handleMessage(
    message: PromptGalleryActionMessage | undefined,
    close: () => void,
  ) {
    if (!message) {
      return;
    }
    if (message.type === "success") {
      close();
      toast.success(message.text);
    } else {
      toast.error(message.text);
    }
  }

  // svelte-ignore state_referenced_locally
  const {
    form: createForm,
    errors: createErrors,
    enhance: createEnhance,
    submitting: createSubmitting,
  } = superForm(data.createForm, {
    applyAction: true,
    invalidateAll: true,
    resetForm: true,
    id: "create-category",
    validators: zod4Client(createCategoryFormSchema),
    onUpdated: ({ form }) => {
      handleMessage(
        form.message as PromptGalleryActionMessage | undefined,
        () => (createOpen = false),
      );
    },
  });

  // svelte-ignore state_referenced_locally
  const {
    form: renameForm,
    errors: renameErrors,
    enhance: renameEnhance,
    submitting: renameSubmitting,
  } = superForm(data.renameForm, {
    applyAction: true,
    invalidateAll: true,
    resetForm: false,
    id: "rename-category",
    validators: zod4Client(renameCategoryFormSchema),
    onUpdated: ({ form }) => {
      handleMessage(
        form.message as PromptGalleryActionMessage | undefined,
        () => (renameOpen = false),
      );
    },
  });

  // svelte-ignore state_referenced_locally
  const {
    form: deleteForm,
    enhance: deleteEnhance,
    submitting: deleteSubmitting,
  } = superForm(data.deleteForm, {
    applyAction: true,
    invalidateAll: true,
    resetForm: false,
    id: "delete-category",
    validators: zod4Client(deleteCategoryFormSchema),
    onUpdated: ({ form }) => {
      handleMessage(
        form.message as PromptGalleryActionMessage | undefined,
        () => (deleteOpen = false),
      );
    },
  });

  function openRename(category: { slug: string; name: string }) {
    renameTarget = category;
    $renameForm.slug = category.slug;
    $renameForm.name = category.name;
    renameOpen = true;
  }

  function openDelete(category: { slug: string; name: string }) {
    deleteTarget = category;
    $deleteForm.slug = category.slug;
    deleteOpen = true;
  }
</script>

<svelte:head>
  <title>Prompt Gallery | Aggregator Offers Tool</title>
  <meta
    name="description"
    content="Manage the inspiration prompt gallery shown in the image generator."
  />
</svelte:head>

<div class="relative isolate min-h-screen overflow-hidden">
  <div class="bg-background absolute inset-0 -z-20"></div>
  <div
    class="absolute inset-x-0 top-0 -z-10 h-[20rem] bg-[radial-gradient(circle_at_top_left,_color-mix(in_oklab,var(--color-chart-1)_20%,transparent),transparent_32%),radial-gradient(circle_at_90%_18%,_color-mix(in_oklab,var(--color-chart-2)_18%,transparent),transparent_28%)]"
  ></div>

  <main
    class="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10"
  >
    <section
      class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
    >
      <div class="space-y-2">
        <h1 class="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
          Prompt gallery
        </h1>
        <p class="text-muted-foreground max-w-2xl text-base leading-7">
          Curate the inspiration categories and prompts users see in the image
          generator.
        </p>
      </div>

      <Button onclick={() => (createOpen = true)}>New Category</Button>
    </section>

    <Card.Root
      class="border-border/70 bg-background/90 overflow-hidden backdrop-blur"
    >
      <Card.Header>
        <Card.Title class="text-2xl tracking-[-0.03em]">Categories</Card.Title>
        <Card.Description>
          Each category groups a collection of prompt items. Open a category to
          manage its items.
        </Card.Description>
      </Card.Header>
      <Card.Content>
        {#if categories.length === 0}
          <p class="text-muted-foreground py-6 text-center text-sm">
            No categories yet. Create the first one to get started.
          </p>
        {:else}
          <Table.Root>
            <Table.Header>
              <Table.Row>
                <Table.Head>Name</Table.Head>
                <Table.Head>Slug</Table.Head>
                <Table.Head class="text-right">Prompts</Table.Head>
                <Table.Head class="text-right">Actions</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {#each categories as category (category.slug)}
                <Table.Row>
                  <Table.Cell>
                    <a
                      href={`/admin/prompt-gallery/${category.slug}`}
                      class="font-medium underline-offset-4 hover:underline"
                    >
                      {category.name}
                    </a>
                  </Table.Cell>
                  <Table.Cell class="text-muted-foreground font-mono text-xs">
                    {category.slug}
                  </Table.Cell>
                  <Table.Cell class="text-right">
                    {category.itemCount}
                  </Table.Cell>
                  <Table.Cell class="text-right">
                    <div class="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onclick={() => openRename(category)}
                      >
                        <FolderPenIcon class="size-4" />
                        Rename
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onclick={() => openDelete(category)}
                      >
                        <Trash2Icon class="size-4" />
                        Delete
                      </Button>
                    </div>
                  </Table.Cell>
                </Table.Row>
              {/each}
            </Table.Body>
          </Table.Root>
        {/if}
      </Card.Content>
    </Card.Root>

    <Dialog.Root bind:open={createOpen}>
      <Dialog.Content class="sm:max-w-md">
        <Dialog.Header>
          <Dialog.Title>New category</Dialog.Title>
          <Dialog.Description>
            The folder slug is derived from the name and cannot change later.
          </Dialog.Description>
        </Dialog.Header>

        <form
          method="POST"
          action="?/createCategory"
          use:createEnhance
          class="grid gap-4"
        >
          <div class="grid gap-2">
            <Label for="create-category-name">Name</Label>
            <Input
              id="create-category-name"
              name="name"
              bind:value={$createForm.name}
              placeholder="Character Design"
            />
            {#if $createErrors.name}
              <p class="text-destructive text-sm">{$createErrors.name[0]}</p>
            {/if}
          </div>
          <Dialog.Footer>
            <Button type="submit" disabled={$createSubmitting}>
              Create Category
            </Button>
          </Dialog.Footer>
        </form>
      </Dialog.Content>
    </Dialog.Root>

    <Dialog.Root bind:open={renameOpen}>
      <Dialog.Content class="sm:max-w-md">
        <Dialog.Header>
          <Dialog.Title>Rename category</Dialog.Title>
          <Dialog.Description>
            Changes the display name only — the slug
            {#if renameTarget}
              <span class="font-mono text-xs">({renameTarget.slug})</span>
            {/if}
            stays the same.
          </Dialog.Description>
        </Dialog.Header>

        <form
          method="POST"
          action="?/renameCategory"
          use:renameEnhance
          class="grid gap-4"
        >
          <input type="hidden" name="slug" value={$renameForm.slug} />
          <div class="grid gap-2">
            <Label for="rename-category-name">Name</Label>
            <Input
              id="rename-category-name"
              name="name"
              bind:value={$renameForm.name}
            />
            {#if $renameErrors.name}
              <p class="text-destructive text-sm">{$renameErrors.name[0]}</p>
            {/if}
          </div>
          <Dialog.Footer>
            <Button type="submit" disabled={$renameSubmitting}>
              Save Name
            </Button>
          </Dialog.Footer>
        </form>
      </Dialog.Content>
    </Dialog.Root>

    <Dialog.Root bind:open={deleteOpen}>
      <Dialog.Content class="sm:max-w-md">
        <Dialog.Header>
          <Dialog.Title>Delete category</Dialog.Title>
          <Dialog.Description>
            {#if deleteTarget}
              This permanently deletes “{deleteTarget.name}” and all of its
              prompts and images. This cannot be undone.
            {/if}
          </Dialog.Description>
        </Dialog.Header>

        <form method="POST" action="?/deleteCategory" use:deleteEnhance>
          <input type="hidden" name="slug" value={$deleteForm.slug} />
          <Dialog.Footer>
            <Button
              type="button"
              variant="outline"
              onclick={() => (deleteOpen = false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={$deleteSubmitting}
            >
              Delete Category
            </Button>
          </Dialog.Footer>
        </form>
      </Dialog.Content>
    </Dialog.Root>
  </main>
</div>
