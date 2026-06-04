import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalObjectStore } from "../object-store.server";
import { parseFrontmatter, serializeFrontmatter } from "./frontmatter";
import {
  createCategory,
  createItem,
  deleteCategory,
  deleteItem,
  getCategory,
  getItem,
  listCategories,
  listItems,
  renameCategory,
  slugify,
  updateItem,
} from "./inspiration-storage.server";

function makePng(name = "image.png"): File {
  return new File([new Uint8Array([137, 80, 78, 71])], name, {
    type: "image/png",
  });
}

describe("frontmatter", () => {
  it("round-trips fields and a multi-line body", () => {
    const text = serializeFrontmatter(
      { title: "Neon Samurai", image: "neon-samurai.png" },
      "line one\nline two",
    );
    expect(parseFrontmatter(text)).toEqual({
      fields: { title: "Neon Samurai", image: "neon-samurai.png" },
      body: "line one\nline two",
    });
  });

  it("strips newlines from field values", () => {
    const text = serializeFrontmatter({ title: "a\nb" }, "body");
    expect(parseFrontmatter(text).fields.title).toBe("a b");
  });

  it("treats text without frontmatter as body-only", () => {
    expect(parseFrontmatter("just a prompt")).toEqual({
      fields: {},
      body: "just a prompt",
    });
  });

  it("keeps colons inside values intact", () => {
    const text = serializeFrontmatter({ title: "Ratio 16:9" }, "");
    expect(parseFrontmatter(text).fields.title).toBe("Ratio 16:9");
  });
});

describe("slugify", () => {
  it("derives kebab-case slugs", () => {
    expect(slugify("Character Design")).toBe("character-design");
    expect(slugify("  Typography & Posters!  ")).toBe("typography-posters");
  });

  it("rejects names with no usable characters", () => {
    expect(() => slugify("!!!")).toThrow(/cannot derive a slug/i);
  });
});

describe("inspiration storage", () => {
  let workdir: string;
  let store: LocalObjectStore;

  beforeEach(() => {
    workdir = mkdtempSync(join(tmpdir(), "inspiration-"));
    store = new LocalObjectStore(workdir);
  });

  afterEach(() => {
    rmSync(workdir, { recursive: true, force: true });
  });

  it("creates a category with metadata and the root placeholder", async () => {
    const category = await createCategory(store, "Character Design");
    expect(category.slug).toBe("character-design");
    expect(category.name).toBe("Character Design");

    expect(await store.getText("inspiration/.keep")).toBe("");
    const meta = await store.getText(
      "inspiration/character-design/_category.md",
    );
    expect(meta).toContain("name: Character Design");
  });

  it("suffixes the slug on collision", async () => {
    await createCategory(store, "Character Design");
    const second = await createCategory(store, "Character design");
    expect(second.slug).toBe("character-design-2");
  });

  it("lists categories sorted by name with item counts", async () => {
    await createCategory(store, "Typography");
    const characters = await createCategory(store, "Character Design");
    await createItem(store, characters.slug, {
      title: "Hero pose",
      prompt: "a hero pose",
      file: makePng(),
    });

    const categories = await listCategories(store);
    expect(categories.map((c) => c.slug)).toEqual([
      "character-design",
      "typography",
    ]);
    expect(categories[0]?.itemCount).toBe(1);
    expect(categories[1]?.itemCount).toBe(0);
  });

  it("falls back to the slug when _category.md is missing", async () => {
    await store.putText("inspiration/orphaned/item.md", "prompt body");
    const category = await getCategory(store, "orphaned");
    expect(category?.name).toBe("orphaned");
    expect(category?.itemCount).toBe(1);
  });

  it("renames a category in place, preserving slug and created date", async () => {
    const category = await createCategory(store, "Character Design");
    await renameCategory(store, category.slug, "Characters");

    const renamed = await getCategory(store, category.slug);
    expect(renamed?.name).toBe("Characters");
    expect(renamed?.createdAt).toBe(category.createdAt);
  });

  it("rejects unsafe slugs", async () => {
    await expect(getCategory(store, "../escape")).rejects.toThrow(
      /invalid inspiration slug/i,
    );
  });

  it("creates, reads, and lists items with prompt as body", async () => {
    const category = await createCategory(store, "Character Design");
    const item = await createItem(store, category.slug, {
      title: "Official character reference sheet",
      prompt: "front view\nside view\nback view",
      file: makePng(),
    });

    expect(item.itemSlug).toBe("official-character-reference-sheet");
    expect(item.image).toBe("official-character-reference-sheet.png");

    const fetched = await getItem(store, category.slug, item.itemSlug);
    expect(fetched?.title).toBe("Official character reference sheet");
    expect(fetched?.prompt).toBe("front view\nside view\nback view");

    const items = await listItems(store, category.slug);
    expect(items).toHaveLength(1);
    expect(items[0]?.itemSlug).toBe(item.itemSlug);
  });

  it("rejects unsupported image types on create", async () => {
    const category = await createCategory(store, "Character Design");
    const gif = new File([new Uint8Array([1])], "a.gif", {
      type: "image/gif",
    });
    await expect(
      createItem(store, category.slug, {
        title: "Bad",
        prompt: "p",
        file: gif,
      }),
    ).rejects.toThrow(/unsupported inspiration image/i);
  });

  it("updates title and prompt, keeping slug and added date", async () => {
    const category = await createCategory(store, "Character Design");
    const item = await createItem(store, category.slug, {
      title: "Hero pose",
      prompt: "old prompt",
      file: makePng(),
    });

    const updated = await updateItem(store, category.slug, item.itemSlug, {
      title: "Hero pose v2",
      prompt: "new prompt",
    });
    expect(updated.itemSlug).toBe(item.itemSlug);
    expect(updated.addedAt).toBe(item.addedAt);
    expect(updated.image).toBe(item.image);

    const fetched = await getItem(store, category.slug, item.itemSlug);
    expect(fetched?.title).toBe("Hero pose v2");
    expect(fetched?.prompt).toBe("new prompt");
  });

  it("replaces the image and removes the stale one when the extension changes", async () => {
    const category = await createCategory(store, "Character Design");
    const item = await createItem(store, category.slug, {
      title: "Hero pose",
      prompt: "p",
      file: makePng(),
    });

    const webp = new File([new Uint8Array([1, 2])], "new.webp", {
      type: "image/webp",
    });
    const updated = await updateItem(store, category.slug, item.itemSlug, {
      title: "Hero pose",
      prompt: "p",
      file: webp,
    });

    expect(updated.image).toBe("hero-pose.webp");
    expect(
      await store.tryGet(`inspiration/${category.slug}/hero-pose.png`),
    ).toBeNull();
    expect(
      await store.tryGet(`inspiration/${category.slug}/hero-pose.webp`),
    ).not.toBeNull();
  });

  it("deletes an item together with its image", async () => {
    const category = await createCategory(store, "Character Design");
    const item = await createItem(store, category.slug, {
      title: "Hero pose",
      prompt: "p",
      file: makePng(),
    });

    await deleteItem(store, category.slug, item.itemSlug);
    expect(await getItem(store, category.slug, item.itemSlug)).toBeNull();
    expect(
      await store.tryGet(`inspiration/${category.slug}/hero-pose.png`),
    ).toBeNull();
    expect(await listItems(store, category.slug)).toEqual([]);
  });

  it("deletes a category and every file inside it", async () => {
    const category = await createCategory(store, "Character Design");
    await createItem(store, category.slug, {
      title: "Hero pose",
      prompt: "p",
      file: makePng(),
    });

    await deleteCategory(store, category.slug);
    expect(await getCategory(store, category.slug)).toBeNull();
    expect(await listCategories(store)).toEqual([]);
  });
});
