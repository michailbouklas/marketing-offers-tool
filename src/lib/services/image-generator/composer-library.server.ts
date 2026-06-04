import { error } from "@sveltejs/kit";
import { prisma } from "$lib/server/prisma";
import type { Prisma } from "../../../generated/prisma/client";
import {
  savedComposerSettingsSchema,
  type ComposerPresetDTO,
  type ComposerTemplateDTO,
  type PresetCreateInput,
  type PresetUpdateInput,
  type TemplateCreateInput,
  type TemplateUpdateInput,
} from "./composer-library";

type PresetRow = {
  id: string;
  name: string;
  settings: unknown;
  createdAt: Date;
  updatedAt: Date;
};

type TemplateRow = {
  id: string;
  userId: string;
  name: string;
  prompt: string;
  settings: unknown;
  visibility: string;
  createdAt: Date;
  updatedAt: Date;
  user: { name: string };
  brands: { brand: { id: number; name: string } }[];
};

function toPresetDTO(row: PresetRow): ComposerPresetDTO {
  return {
    id: row.id,
    name: row.name,
    settings: savedComposerSettingsSchema.parse(row.settings),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toTemplateDTO(
  row: TemplateRow,
  currentUserId: string,
): ComposerTemplateDTO {
  return {
    id: row.id,
    name: row.name,
    prompt: row.prompt,
    settings: savedComposerSettingsSchema.parse(row.settings),
    visibility: row.visibility === "public" ? "public" : "private",
    ownerName: row.user.name,
    ownedByCurrentUser: row.userId === currentUserId,
    brands: row.brands.map((entry) => entry.brand),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function assertAssignedBrands(userId: string, brandIds: number[]) {
  const uniqueBrandIds = [...new Set(brandIds)];
  if (uniqueBrandIds.length === 0) return [];

  const rows = await prisma.user_brand.findMany({
    where: { userId, brandId: { in: uniqueBrandIds } },
    select: { brandId: true },
  });
  if (rows.length !== uniqueBrandIds.length) {
    error(403, "One or more selected brands are not assigned to this user");
  }
  return uniqueBrandIds;
}

function handleUniqueNameError(err: unknown): never {
  const known = err as { code?: string };
  if (known.code === "P2002") {
    error(409, "A saved item with this name already exists");
  }
  throw err;
}

export async function listPresetsForUser(
  userId: string,
): Promise<ComposerPresetDTO[]> {
  const rows = await prisma.imageGeneratorPreset.findMany({
    where: { userId },
    orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
  });

  return rows.map(toPresetDTO);
}

export async function createPreset(
  userId: string,
  input: PresetCreateInput,
): Promise<ComposerPresetDTO> {
  try {
    const row = await prisma.imageGeneratorPreset.create({
      data: {
        userId,
        name: input.name,
        settings: input.settings as unknown as Prisma.InputJsonValue,
      },
    });
    return toPresetDTO(row);
  } catch (err) {
    handleUniqueNameError(err);
  }
}

export async function updatePreset(
  userId: string,
  id: string,
  input: PresetUpdateInput,
): Promise<ComposerPresetDTO> {
  const existing = await prisma.imageGeneratorPreset.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!existing) error(404, "Preset not found");

  try {
    const row = await prisma.imageGeneratorPreset.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.settings !== undefined
          ? { settings: input.settings as unknown as Prisma.InputJsonValue }
          : {}),
      },
    });
    return toPresetDTO(row);
  } catch (err) {
    handleUniqueNameError(err);
  }
}

export async function deletePreset(userId: string, id: string): Promise<void> {
  const deleted = await prisma.imageGeneratorPreset.deleteMany({
    where: { id, userId },
  });
  if (deleted.count === 0) error(404, "Preset not found");
}

export async function listTemplatesForUser(userId: string): Promise<{
  privateTemplates: ComposerTemplateDTO[];
  publicTemplates: ComposerTemplateDTO[];
}> {
  const [privateRows, publicRows] = await Promise.all([
    prisma.imageGeneratorTemplate.findMany({
      where: { userId, visibility: "private" },
      include: {
        user: { select: { name: true } },
        brands: { include: { brand: { select: { id: true, name: true } } } },
      },
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
    }),
    prisma.imageGeneratorTemplate.findMany({
      where: { visibility: "public" },
      include: {
        user: { select: { name: true } },
        brands: { include: { brand: { select: { id: true, name: true } } } },
      },
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
    }),
  ]);

  return {
    privateTemplates: privateRows.map((row) => toTemplateDTO(row, userId)),
    publicTemplates: publicRows.map((row) => toTemplateDTO(row, userId)),
  };
}

export async function createTemplate(
  userId: string,
  input: TemplateCreateInput,
): Promise<ComposerTemplateDTO> {
  const brandIds = await assertAssignedBrands(userId, input.brandIds);
  try {
    const row = await prisma.imageGeneratorTemplate.create({
      data: {
        userId,
        name: input.name,
        prompt: input.prompt,
        settings: input.settings as unknown as Prisma.InputJsonValue,
        visibility: input.visibility,
        brands: {
          create: brandIds.map((brandId) => ({ brandId })),
        },
      },
      include: {
        user: { select: { name: true } },
        brands: { include: { brand: { select: { id: true, name: true } } } },
      },
    });
    return toTemplateDTO(row, userId);
  } catch (err) {
    handleUniqueNameError(err);
  }
}

export async function updateTemplate(
  userId: string,
  id: string,
  input: TemplateUpdateInput,
): Promise<ComposerTemplateDTO> {
  const existing = await prisma.imageGeneratorTemplate.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!existing) error(404, "Template not found");

  const brandIds =
    input.brandIds !== undefined
      ? await assertAssignedBrands(userId, input.brandIds)
      : undefined;

  try {
    const row = await prisma.imageGeneratorTemplate.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.prompt !== undefined ? { prompt: input.prompt } : {}),
        ...(input.settings !== undefined
          ? { settings: input.settings as unknown as Prisma.InputJsonValue }
          : {}),
        ...(input.visibility !== undefined
          ? { visibility: input.visibility }
          : {}),
        ...(brandIds !== undefined
          ? {
              brands: {
                deleteMany: {},
                create: brandIds.map((brandId) => ({ brandId })),
              },
            }
          : {}),
      },
      include: {
        user: { select: { name: true } },
        brands: { include: { brand: { select: { id: true, name: true } } } },
      },
    });
    return toTemplateDTO(row, userId);
  } catch (err) {
    handleUniqueNameError(err);
  }
}

export async function deleteTemplate(
  userId: string,
  id: string,
): Promise<void> {
  const deleted = await prisma.imageGeneratorTemplate.deleteMany({
    where: { id, userId },
  });
  if (deleted.count === 0) error(404, "Template not found");
}
