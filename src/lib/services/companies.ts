import { z } from "zod";

// Restated rather than imported — admin forms deliberately stay decoupled from each other.
const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v == null || v === "" ? null : v));

/** Checkbox values from `form.getAll('brandIds')`; ids as strings, like the location form. */
export const createCompanyFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  registrationNumber: optionalText,
  vatNumber: optionalText,
  /** GL databaseId (dbo.sapbw_gl), e.g. PHC_EUR; scopes management accounts. */
  sapDatabaseId: optionalText,
  active: z.boolean().default(false),
  /** Checkbox values from form.getAll('brandIds') */
  brandIds: z.array(z.string().regex(/^\d+$/)).default([]),
});

export const editCompanyFormSchema = createCompanyFormSchema.extend({
  id: z.coerce.number().int().positive(),
});

export const deleteCompanyFormSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type CompanyEditorData = z.infer<typeof createCompanyFormSchema>;

/** Dedupes and keeps only valid integer ids from the checkbox strings. */
export function normalizeBrandIds(ids: string[]): number[] {
  return [...new Set(ids.map(Number))].filter((id) => Number.isInteger(id));
}
