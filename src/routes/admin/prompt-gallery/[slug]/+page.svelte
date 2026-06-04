<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import { toast } from "svelte-sonner";
  import { zod4Client } from "sveltekit-superforms/adapters";
  import { superForm } from "sveltekit-superforms/client";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import { Textarea } from "$lib/components/ui/textarea/index.js";
  import ImageOffIcon from "@lucide/svelte/icons/image-off";
  import PencilIcon from "@lucide/svelte/icons/pencil";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";
  import {
    deleteItemFormSchema,
    type PromptGalleryActionMessage,
  } from "$lib/services/inspiration/category-form";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const category = $derived(data.category);
  const items = $derived(data.items);

  type ItemRow = PageData["items"][number];

  let editorOpen = $state(false);
  let editorMode = $state<"create" | "edit">("create");
  let editingItem = $state<ItemRow | null>(null);
  let editorTitle = $state("");
  let editorPrompt = $state("");
  let editorFiles = $state<FileList | undefined>(undefined);
  let editorSubmitting = $state(false);

  let deleteOpen = $state(false);
  let deleteTarget = $state<ItemRow | null>(null);

  function openCreate() {
    editorMode = "create";
    editingItem = null;
    editorTitle = "";
    editorPrompt = "";
    editorFiles = undefined;
    editorOpen = true;
  }

  function openEdit(item: ItemRow) {
    editorMode = "edit";
    editingItem = item;
    editorTitle = item.title;
    editorPrompt = item.prompt;
    editorFiles = undefined;
    editorOpen = true;
  }

  async function submitItem(submitEvent: SubmitEvent) {
    submitEvent.preventDefault();

    const file = editorFiles?.[0] ?? null;
    if (!editorTitle.trim()) {
      toast.error("Title is required.");
      return;
    }
    if (!editorPrompt.trim()) {
      toast.error("Prompt is required.");
      return;
    }
    if (editorMode === "create" && !file) {
      toast.error("An image is required.");
      return;
    }

    const body = new FormData();
    body.set("title", editorTitle);
    body.set("prompt", editorPrompt);
    if (file) {
      body.set("file", file);
    }

    const url =
      editorMode === "create"
        ? `/api/admin/prompt-gallery/${category.slug}/items`
        : `/api/admin/prompt-gallery/${category.slug}/items/${editingItem?.itemSlug}`;

    editorSubmitting = true;
    try {
      const response = await fetch(url, {
        method: editorMode === "create" ? "POST" : "PUT",
        body,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        toast.error(payload?.message ?? "Unable to save the item.");
        return;
      }

      editorOpen = false;
      toast.success(editorMode === "create" ? "Item added." : "Item updated.");
      await invalidateAll();
    } catch {
      toast.error("Unable to save the item.");
    } finally {
      editorSubmitting = false;
    }
  }

  // svelte-ignore state_referenced_locally
  const {
    form: deleteForm,
    enhance: deleteEnhance,
    submitting: deleteSubmitting,
  } = superForm(data.deleteItemForm, {
    applyAction: true,
    invalidateAll: true,
    resetForm: false,
    id: "delete-item",
    validators: zod4Client(deleteItemFormSchema),
    onUpdated: ({ form }) => {
      const message = form.message as PromptGalleryActionMessage | undefined;
      if (!message) {
        return;
      }
      if (message.type === "success") {
        deleteOpen = false;
        toast.success(message.text);
      } else {
        toast.error(message.text);
      }
    },
  });

  function openDelete(item: ItemRow) {
    deleteTarget = item;
    $deleteForm.itemSlug = item.itemSlug;
    deleteOpen = true;
  }
</script>

<svelte:head>
  <title>{category.name} | Prompt Gallery | Aggregator Offers Tool</title>
  <meta
    name="description"
    content={`Manage the prompts in the ${category.name} inspiration category.`}
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
        <p class="text-muted-foreground text-sm">
          <a
            href="/admin/prompt-gallery"
            class="underline-offset-4 hover:underline"
          >
            Prompt gallery
          </a>
          / <span class="font-mono text-xs">{category.slug}</span>
        </p>
        <h1 class="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
          {category.name}
        </h1>
        <p class="text-muted-foreground max-w-2xl text-base leading-7">
          Add, edit, or remove the prompts in this category.
        </p>
      </div>

      <Button onclick={openCreate}>Add Item</Button>
    </section>

    <Card.Root
      class="border-border/70 bg-background/90 overflow-hidden backdrop-blur"
    >
      <Card.Header>
        <Card.Title class="text-2xl tracking-[-0.03em]">Items</Card.Title>
        <Card.Description>
          Each item is shown to users with its title, image, and copyable
          prompt.
        </Card.Description>
      </Card.Header>
      <Card.Content>
        {#if items.length === 0}
          <p class="text-muted-foreground py-6 text-center text-sm">
            No items yet. Add the first prompt to this category.
          </p>
        {:else}
          <Table.Root>
            <Table.Header>
              <Table.Row>
                <Table.Head class="w-24">Image</Table.Head>
                <Table.Head>Title</Table.Head>
                <Table.Head>Prompt</Table.Head>
                <Table.Head class="text-right">Actions</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {#each items as item (item.itemSlug)}
                <Table.Row>
                  <Table.Cell>
                    {#if item.imageUrl}
                      <img
                        src={item.imageUrl}
                        alt={item.title}
                        class="size-16 rounded-md object-cover"
                        loading="lazy"
                      />
                    {:else}
                      <div
                        class="bg-muted text-muted-foreground flex size-16 items-center justify-center rounded-md"
                      >
                        <ImageOffIcon class="size-5" />
                      </div>
                    {/if}
                  </Table.Cell>
                  <Table.Cell>
                    <div class="flex flex-col gap-1">
                      <span class="font-medium">{item.title}</span>
                      <span class="text-muted-foreground font-mono text-xs">
                        {item.itemSlug}
                      </span>
                    </div>
                  </Table.Cell>
                  <Table.Cell class="max-w-md">
                    <p class="text-muted-foreground line-clamp-2 text-sm">
                      {item.prompt}
                    </p>
                  </Table.Cell>
                  <Table.Cell class="text-right">
                    <div class="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onclick={() => openEdit(item)}
                      >
                        <PencilIcon class="size-4" />
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onclick={() => openDelete(item)}
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

    <Dialog.Root bind:open={editorOpen}>
      <Dialog.Content class="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <Dialog.Header>
          <Dialog.Title>
            {editorMode === "create" ? "Add item" : "Edit item"}
          </Dialog.Title>
          <Dialog.Description>
            {editorMode === "create"
              ? "Provide a title, an image, and the prompt users will copy."
              : "Update the title or prompt; upload a new image to replace the current one."}
          </Dialog.Description>
        </Dialog.Header>

        <form onsubmit={submitItem} class="grid gap-4">
          <div class="grid gap-2">
            <Label for="item-title">Title</Label>
            <Input
              id="item-title"
              bind:value={editorTitle}
              placeholder="Official character reference sheet"
            />
          </div>

          <div class="grid gap-2">
            <Label for="item-image">
              Image
              {#if editorMode === "edit"}
                <span class="text-muted-foreground font-normal">
                  (leave empty to keep the current image)
                </span>
              {/if}
            </Label>
            <Input
              id="item-image"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              bind:files={editorFiles}
            />
            {#if editorMode === "edit" && editingItem?.imageUrl}
              <img
                src={editingItem.imageUrl}
                alt={editingItem.title}
                class="bg-muted size-24 rounded-md object-cover"
              />
            {/if}
          </div>

          <div class="grid gap-2">
            <Label for="item-prompt">Prompt</Label>
            <Textarea
              id="item-prompt"
              bind:value={editorPrompt}
              rows={8}
              placeholder="A cinematic portrait of..."
            />
          </div>

          <Dialog.Footer>
            <Button type="submit" disabled={editorSubmitting}>
              {editorMode === "create" ? "Add Item" : "Save Changes"}
            </Button>
          </Dialog.Footer>
        </form>
      </Dialog.Content>
    </Dialog.Root>

    <Dialog.Root bind:open={deleteOpen}>
      <Dialog.Content class="sm:max-w-md">
        <Dialog.Header>
          <Dialog.Title>Delete item</Dialog.Title>
          <Dialog.Description>
            {#if deleteTarget}
              This permanently deletes “{deleteTarget.title}” and its image.
              This cannot be undone.
            {/if}
          </Dialog.Description>
        </Dialog.Header>

        <form method="POST" action="?/deleteItem" use:deleteEnhance>
          <input type="hidden" name="itemSlug" value={$deleteForm.itemSlug} />
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
              Delete Item
            </Button>
          </Dialog.Footer>
        </form>
      </Dialog.Content>
    </Dialog.Root>
  </main>
</div>
