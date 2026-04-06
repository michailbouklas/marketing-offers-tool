import type { brandModel } from "../../generated/prisma/models/brand";

export type Brand = brandModel;

export type BrandOption = {
  id: number;
  name: string;
  alias: string;
  slug: string;
  active: boolean;
};

export function formatBrandLabel(brand: Pick<BrandOption, "name" | "alias">) {
  const name = brand.name.trim();
  const alias = brand.alias.trim();

  if (alias.length === 0 || alias.toLowerCase() === name.toLowerCase()) {
    return name;
  }

  return `${name} (${alias})`;
}
