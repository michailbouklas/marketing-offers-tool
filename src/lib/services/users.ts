import type { UserRole } from "$lib/auth/roles";
import type { BrandOption } from "$lib/services/brands";

export type UserRecord = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  brands: BrandOption[];
  createdAt: Date;
  banned: boolean;
};
