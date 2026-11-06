import { prisma } from "$lib/server/prisma";
import { Prisma } from "../../generated/prisma/client";
import { normalizeBrandIds, type CompanyEditorData } from "./companies";

// Ported from energy-platform's companies service, minus its location links.
const companyAdminSelect = {
  id: true,
  name: true,
  registrationNumber: true,
  vatNumber: true,
  sapDatabaseId: true,
  active: true,
  brands: { select: { brand: { select: { id: true, name: true } } } },
} as const;

type CompanyAdminRecord = Prisma.CompanyGetPayload<{
  select: typeof companyAdminSelect;
}>;

/** Flattens the join rows to the brands themselves, sorted for a stable display. */
function withBrands(company: CompanyAdminRecord) {
  return {
    ...company,
    brands: company.brands
      .map((item) => item.brand)
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export async function listCompaniesAdmin() {
  const companies = await prisma.company.findMany({
    select: companyAdminSelect,
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
  return companies.map(withBrands);
}

function toWriteData(data: CompanyEditorData) {
  return {
    name: data.name,
    registrationNumber: data.registrationNumber,
    vatNumber: data.vatNumber,
    sapDatabaseId: data.sapDatabaseId,
    active: data.active,
  };
}

function translatePrismaError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      const target = String(error.meta?.target ?? "");
      throw new Error(
        target.includes("sapDatabaseId")
          ? "That SAP database id is already used by another company."
          : "A company with that name already exists.",
      );
    }
    if (error.code === "P2003") {
      throw new Error("One or more selected brands no longer exist.");
    }
  }
  throw error;
}

async function validateBrandIds(data: CompanyEditorData) {
  const brandIds = normalizeBrandIds(data.brandIds);
  if (brandIds.length === 0) return brandIds;
  const count = await prisma.brand.count({ where: { id: { in: brandIds } } });
  if (count !== brandIds.length) {
    throw new Error("One or more selected brands no longer exist.");
  }
  return brandIds;
}

/** Replaces the company's brand rows wholesale. */
async function replaceCompanyBrands(
  tx: Prisma.TransactionClient,
  companyId: number,
  brandIds: number[],
) {
  await tx.brand_company.deleteMany({ where: { companyId } });
  if (brandIds.length > 0) {
    await tx.brand_company.createMany({
      data: brandIds.map((brandId) => ({ brandId, companyId })),
      skipDuplicates: true,
    });
  }
}

export async function createCompany(data: CompanyEditorData) {
  const brandIds = await validateBrandIds(data);
  try {
    await prisma.$transaction(async (tx) => {
      // The join rows need the new id, so the scalar row goes first.
      const created = await tx.company.create({
        data: toWriteData(data),
        select: { id: true },
      });
      await replaceCompanyBrands(tx, created.id, brandIds);
    });
  } catch (error) {
    translatePrismaError(error);
  }
}

export async function updateCompany(id: number, data: CompanyEditorData) {
  const brandIds = await validateBrandIds(data);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.company.update({
        where: { id },
        data: toWriteData(data),
        select: { id: true },
      });
      await replaceCompanyBrands(tx, id, brandIds);
    });
  } catch (error) {
    translatePrismaError(error);
  }
}

/** brand_company rows cascade with the company. */
export async function deleteCompany(id: number) {
  await prisma.company.delete({ where: { id } });
}
