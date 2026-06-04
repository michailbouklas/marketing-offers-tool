import { normalize, sep } from "node:path";
import type { ObjectStore, StorageKey } from "../object-store.server";
import { extensionForContentType } from "../reference-storage";
import { parseFrontmatter, serializeFrontmatter } from "./frontmatter";

/**
 * Storage layout (no database tables — everything lives in the object store):
 *
 *   inspiration/.keep                                  root placeholder
 *   inspiration/<category-slug>/_category.md           category metadata
 *   inspiration/<category-slug>/<item-slug>.md         item frontmatter + prompt body
 *   inspiration/<category-slug>/<item-slug>.<ext>      item image (png/jpg/webp)
 *
 * Category and item slugs are fixed after creation; only the display
 * name/title in the metadata files changes on edit.
 */

const INSPIRATION_ROOT = "inspiration";
const CATEGORY_META_FILE = "_category.md";
const KEEP_FILE = ".keep";
const SLUG_COLLISION_LIMIT = 50;

export interface InspirationCategory {
  slug: string;
  name: string;
  createdAt: string | null;
  itemCount: number;
}

export interface InspirationItem {
  itemSlug: string;
  title: string;
  /** Image filename within the category folder (e.g. `my-item.png`). */
  image: string | null;
  addedAt: string | null;
  prompt: string;
}

export interface InspirationItemInput {
  title: string;
  prompt: string;
  file?: File;
}

function ensureSafeSlug(slug: string): string {
  if (
    !slug ||
    slug.includes("/") ||
    slug.includes("\\") ||
    slug.includes("..")
  ) {
    throw new Error(`Invalid inspiration slug: ${JSON.stringify(slug)}`);
  }
  const normalized = normalize(slug);
  if (normalized !== slug || normalized.includes(sep)) {
    throw new Error(`Invalid inspiration slug: ${JSON.stringify(slug)}`);
  }
  return slug;
}

/** Derive a URL/key-safe slug from a human name; throws if nothing remains. */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
  if (!slug) {
    throw new Error(`Cannot derive a slug from ${JSON.stringify(name)}`);
  }
  return ensureSafeSlug(slug);
}

function categoryDirPrefix(slug: string): StorageKey {
  return `${INSPIRATION_ROOT}/${ensureSafeSlug(slug)}`;
}

function categoryMetaKey(slug: string): StorageKey {
  return `${categoryDirPrefix(slug)}/${CATEGORY_META_FILE}`;
}

function itemMdKey(slug: string, itemSlug: string): StorageKey {
  return `${categoryDirPrefix(slug)}/${ensureSafeSlug(itemSlug)}.md`;
}

function itemImageStorageKey(slug: string, image: string): StorageKey {
  return `${categoryDirPrefix(slug)}/${ensureSafeSlug(image)}`;
}

export function inspirationImageKey(slug: string, image: string): StorageKey {
  return itemImageStorageKey(slug, image);
}

/** Materialize the root folder (object stores have no real directories). */
async function ensureRoot(store: ObjectStore): Promise<void> {
  const keepKey = `${INSPIRATION_ROOT}/${KEEP_FILE}`;
  if ((await store.getText(keepKey)) === null) {
    await store.putText(keepKey, "", "text/plain; charset=utf-8");
  }
}

async function nextFreeSlug(
  base: string,
  exists: (candidate: string) => Promise<boolean>,
): Promise<string> {
  if (!(await exists(base))) {
    return base;
  }
  for (let i = 2; i <= SLUG_COLLISION_LIMIT; i += 1) {
    const candidate = `${base}-${i}`;
    if (!(await exists(candidate))) {
      return candidate;
    }
  }
  throw new Error(`Too many slug collisions for ${JSON.stringify(base)}`);
}

// --------------------------------------------------------------------------
// Categories
// --------------------------------------------------------------------------

export async function listCategories(
  store: ObjectStore,
): Promise<InspirationCategory[]> {
  const entries = await store.list(INSPIRATION_ROOT);
  const categories = await Promise.all(
    entries
      .filter((entry) => entry.isFolder)
      .map((entry) => getCategory(store, entry.name)),
  );
  return categories
    .filter((category): category is InspirationCategory => category !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getCategory(
  store: ObjectStore,
  slug: string,
): Promise<InspirationCategory | null> {
  const safeSlug = ensureSafeSlug(slug);
  const [meta, entries] = await Promise.all([
    store.getText(categoryMetaKey(safeSlug)),
    store.list(categoryDirPrefix(safeSlug)),
  ]);
  if (meta === null && entries.length === 0) {
    return null;
  }
  const fields = meta === null ? {} : parseFrontmatter(meta).fields;
  const itemCount = entries.filter(
    (entry) =>
      !entry.isFolder &&
      entry.name.endsWith(".md") &&
      entry.name !== CATEGORY_META_FILE,
  ).length;
  return {
    slug: safeSlug,
    name: fields.name || safeSlug,
    createdAt: fields.created || null,
    itemCount,
  };
}

export async function createCategory(
  store: ObjectStore,
  name: string,
): Promise<InspirationCategory> {
  const trimmed = name.trim();
  const slug = await nextFreeSlug(
    slugify(trimmed),
    async (candidate) =>
      (await store.getText(categoryMetaKey(candidate))) !== null,
  );
  await ensureRoot(store);
  const createdAt = new Date().toISOString();
  await store.putText(
    categoryMetaKey(slug),
    serializeFrontmatter({ name: trimmed, created: createdAt }, ""),
  );
  return { slug, name: trimmed, createdAt, itemCount: 0 };
}

export async function renameCategory(
  store: ObjectStore,
  slug: string,
  name: string,
): Promise<void> {
  const existing = await getCategory(store, slug);
  if (!existing) {
    throw new Error(`Category not found: ${JSON.stringify(slug)}`);
  }
  await store.putText(
    categoryMetaKey(existing.slug),
    serializeFrontmatter(
      {
        name: name.trim(),
        created: existing.createdAt ?? new Date().toISOString(),
      },
      "",
    ),
  );
}

export async function deleteCategory(
  store: ObjectStore,
  slug: string,
): Promise<void> {
  const prefix = categoryDirPrefix(slug);
  const entries = await store.list(prefix);
  await Promise.all(
    entries
      .filter((entry) => !entry.isFolder)
      .map((entry) => store.remove(`${prefix}/${entry.name}`)),
  );
}

// --------------------------------------------------------------------------
// Items
// --------------------------------------------------------------------------

function parseItem(itemSlug: string, text: string): InspirationItem {
  const { fields, body } = parseFrontmatter(text);
  return {
    itemSlug,
    title: fields.title || itemSlug,
    image: fields.image || null,
    addedAt: fields.added || null,
    prompt: body,
  };
}

export async function listItems(
  store: ObjectStore,
  slug: string,
): Promise<InspirationItem[]> {
  const prefix = categoryDirPrefix(slug);
  const entries = await store.list(prefix);
  const items = await Promise.all(
    entries
      .filter(
        (entry) =>
          !entry.isFolder &&
          entry.name.endsWith(".md") &&
          entry.name !== CATEGORY_META_FILE,
      )
      .map(async (entry) => {
        const text = await store.getText(`${prefix}/${entry.name}`);
        if (text === null) {
          return null;
        }
        return parseItem(entry.name.slice(0, -".md".length), text);
      }),
  );
  return items
    .filter((item): item is InspirationItem => item !== null)
    .sort((a, b) => (b.addedAt ?? "").localeCompare(a.addedAt ?? ""));
}

export async function getItem(
  store: ObjectStore,
  slug: string,
  itemSlug: string,
): Promise<InspirationItem | null> {
  const safeItemSlug = ensureSafeSlug(itemSlug);
  const text = await store.getText(itemMdKey(slug, safeItemSlug));
  return text === null ? null : parseItem(safeItemSlug, text);
}

async function writeItemImage(
  store: ObjectStore,
  slug: string,
  itemSlug: string,
  file: File,
): Promise<string> {
  const contentType = file.type ?? "";
  const extension = extensionForContentType(contentType);
  if (!extension) {
    throw new Error(
      `Unsupported inspiration image content type: ${JSON.stringify(contentType)}`,
    );
  }
  const image = `${itemSlug}.${extension}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await store.put(itemImageStorageKey(slug, image), buffer, contentType);
  return image;
}

export async function createItem(
  store: ObjectStore,
  slug: string,
  input: InspirationItemInput & { file: File },
): Promise<InspirationItem> {
  const safeSlug = ensureSafeSlug(slug);
  const title = input.title.trim();
  const itemSlug = await nextFreeSlug(
    slugify(title),
    async (candidate) =>
      (await store.getText(itemMdKey(safeSlug, candidate))) !== null,
  );
  const image = await writeItemImage(store, safeSlug, itemSlug, input.file);
  const addedAt = new Date().toISOString();
  await store.putText(
    itemMdKey(safeSlug, itemSlug),
    serializeFrontmatter({ title, image, added: addedAt }, input.prompt),
  );
  return { itemSlug, title, image, addedAt, prompt: input.prompt.trim() };
}

export async function updateItem(
  store: ObjectStore,
  slug: string,
  itemSlug: string,
  input: InspirationItemInput,
): Promise<InspirationItem> {
  const existing = await getItem(store, slug, itemSlug);
  if (!existing) {
    throw new Error(`Inspiration item not found: ${JSON.stringify(itemSlug)}`);
  }

  let image = existing.image;
  if (input.file) {
    image = await writeItemImage(store, slug, existing.itemSlug, input.file);
    // A new upload may change the extension — drop the stale old image.
    if (existing.image && existing.image !== image) {
      await store.remove(itemImageStorageKey(slug, existing.image));
    }
  }

  const title = input.title.trim();
  const addedAt = existing.addedAt ?? new Date().toISOString();
  await store.putText(
    itemMdKey(slug, existing.itemSlug),
    serializeFrontmatter(
      { title, ...(image ? { image } : {}), added: addedAt },
      input.prompt,
    ),
  );
  return {
    itemSlug: existing.itemSlug,
    title,
    image,
    addedAt,
    prompt: input.prompt.trim(),
  };
}

export async function deleteItem(
  store: ObjectStore,
  slug: string,
  itemSlug: string,
): Promise<void> {
  const existing = await getItem(store, slug, itemSlug);
  if (!existing) {
    return;
  }
  if (existing.image) {
    await store.remove(itemImageStorageKey(slug, existing.image));
  }
  await store.remove(itemMdKey(slug, existing.itemSlug));
}
