import { z } from "zod";

/**
 * Browser-safe form schemas for the admin prompt gallery. Item create/edit
 * carry a file upload and go through the dedicated API endpoints instead of
 * superforms (matching the brand-asset upload pattern), so only the text-only
 * actions are modeled here.
 */

const nameField = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(80, "Name must be 80 characters or fewer");

export const createCategoryFormSchema = z.object({
  name: nameField,
});

export const renameCategoryFormSchema = z.object({
  slug: z.string().trim().min(1, "Category is required"),
  name: nameField,
});

export const deleteCategoryFormSchema = z.object({
  slug: z.string().trim().min(1, "Category is required"),
});

export const deleteItemFormSchema = z.object({
  itemSlug: z.string().trim().min(1, "Item is required"),
});

export type CreateCategoryFormData = z.infer<typeof createCategoryFormSchema>;
export type RenameCategoryFormData = z.infer<typeof renameCategoryFormSchema>;
export type DeleteCategoryFormData = z.infer<typeof deleteCategoryFormSchema>;
export type DeleteItemFormData = z.infer<typeof deleteItemFormSchema>;

export type PromptGalleryActionMessage = {
  type: "success" | "error";
  text: string;
};

export function getDefaultCreateCategoryFormData(): CreateCategoryFormData {
  return { name: "" };
}

export function getDefaultRenameCategoryFormData(): RenameCategoryFormData {
  return { slug: "", name: "" };
}

export function getDefaultDeleteCategoryFormData(): DeleteCategoryFormData {
  return { slug: "" };
}

export function getDefaultDeleteItemFormData(): DeleteItemFormData {
  return { itemSlug: "" };
}
