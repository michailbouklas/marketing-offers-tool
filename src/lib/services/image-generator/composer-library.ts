import { z } from "zod";

export const savedComposerSettingsSchema = z.object({
  provider: z.enum(["imagerouter", "openai"]),
  models: z.array(z.string().min(1)).min(1),
  size: z.string().min(1),
  style: z.string().min(1),
  camera: z.string().min(1),
  outputFormat: z.enum(["png", "jpg"]),
  negativePrompt: z.string().max(2000),
  quality: z.enum(["auto", "low", "medium", "high"]),
  background: z.enum(["auto", "opaque", "transparent"]),
  matchReferences: z.boolean(),
  enhance: z.boolean(),
  samplesPerModel: z.number().int().positive(),
  brandId: z.number().int().positive().nullable(),
});

export type SavedComposerSettings = z.infer<typeof savedComposerSettingsSchema>;

export const presetCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  settings: savedComposerSettingsSchema,
});

export const presetUpdateSchema = presetCreateSchema
  .partial()
  .refine(
    (value) => value.name !== undefined || value.settings !== undefined,
    "At least one field is required",
  );

export const templateVisibilitySchema = z.enum(["private", "public"]);
export type TemplateVisibility = z.infer<typeof templateVisibilitySchema>;

const templateBaseSchema = z.object({
  name: z.string().trim().min(1).max(120),
  prompt: z.string().trim().min(1).max(20_000),
  settings: savedComposerSettingsSchema,
  visibility: templateVisibilitySchema,
  brandIds: z.array(z.number().int().positive()),
});

export const templateCreateSchema = templateBaseSchema.extend({
  brandIds: z.array(z.number().int().positive()).default([]),
});

export const templateUpdateSchema = templateBaseSchema
  .partial()
  .refine(
    (value) =>
      value.name !== undefined ||
      value.prompt !== undefined ||
      value.settings !== undefined ||
      value.visibility !== undefined ||
      value.brandIds !== undefined,
    "At least one field is required",
  );

export type PresetCreateInput = z.infer<typeof presetCreateSchema>;
export type PresetUpdateInput = z.infer<typeof presetUpdateSchema>;
export type TemplateCreateInput = z.infer<typeof templateCreateSchema>;
export type TemplateUpdateInput = z.infer<typeof templateUpdateSchema>;

export interface ComposerPresetDTO {
  id: string;
  name: string;
  settings: SavedComposerSettings;
  createdAt: string;
  updatedAt: string;
}

export interface ComposerTemplateBrandDTO {
  id: number;
  name: string;
}

export interface ComposerTemplateDTO {
  id: string;
  name: string;
  prompt: string;
  settings: SavedComposerSettings;
  visibility: TemplateVisibility;
  ownerName: string;
  ownedByCurrentUser: boolean;
  brands: ComposerTemplateBrandDTO[];
  createdAt: string;
  updatedAt: string;
}

export interface ComposerTemplateGroupsDTO {
  privateTemplates: ComposerTemplateDTO[];
  publicTemplates: ComposerTemplateDTO[];
}
