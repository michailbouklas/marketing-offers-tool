import {
  defaultUserRole,
  parseRoles,
  userRoles,
  type UserRole,
} from "$lib/auth/roles";
import { z } from "zod";

const passwordField = z
  .string()
  .trim()
  .min(8, "Password must be at least 8 characters");

const optionalPasswordField = z
  .string()
  .trim()
  .default("")
  .refine(
    (value) => value === "" || value.length >= 8,
    "Password must be at least 8 characters",
  );

export const userRoleOptions = userRoles;

const rolesField = z.preprocess(
  (value) => {
    if (Array.isArray(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim().length > 0) {
      return value.split(",").map((role) => role.trim());
    }

    return [];
  },
  z
    .array(z.enum(userRoles))
    .refine((roles) => roles.length > 0, "Select at least one role")
    .default([defaultUserRole]),
);

const brandIdsField = z.preprocess(
  (value) => {
    if (Array.isArray(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim().length > 0) {
      return [value];
    }

    return [];
  },
  z.array(z.string().trim().regex(/^\d+$/, "Select a valid brand")).default([]),
);

export const createUserFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .email("Enter a valid email address"),
  password: passwordField,
  roles: rolesField,
  brandIds: brandIdsField,
});

export const editUserFormSchema = z.object({
  userId: z.string().trim().min(1, "User ID is required"),
  name: z.string().trim().min(1, "Name is required"),
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .email("Enter a valid email address"),
  password: optionalPasswordField,
  roles: rolesField,
  brandIds: brandIdsField,
});

export type CreateUserFormData = z.infer<typeof createUserFormSchema>;
export type EditUserFormData = z.infer<typeof editUserFormSchema>;

export type UserEditorActionMessage = {
  type: "success" | "error";
  text: string;
};

type UserEditorDefaults = {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  role?: string | null;
  roles?: string[] | null;
  brandIds?: string[] | null;
  brands?: Array<{ id: number }> | null;
};

export function getDefaultCreateUserFormData(): CreateUserFormData {
  return {
    name: "",
    email: "",
    password: "",
    roles: [defaultUserRole],
    brandIds: [],
  };
}

export function getDefaultEditUserFormData(
  user?: UserEditorDefaults,
): EditUserFormData {
  return {
    userId: user?.id ?? "",
    name: user?.name ?? "",
    email: user?.email ?? "",
    password: "",
    roles: normalizeUserRoles(user),
    brandIds: normalizeBrandIds(user),
  };
}

function normalizeUserRoles(user?: UserEditorDefaults): UserRole[] {
  const fromArray = (user?.roles ?? [])
    .map((role) => role.trim())
    .filter((role): role is UserRole =>
      (userRoles as readonly string[]).includes(role),
    );

  const roles = fromArray.length > 0 ? fromArray : parseRoles(user?.role);

  return roles.length > 0 ? Array.from(new Set(roles)) : [defaultUserRole];
}

function normalizeBrandIds(user?: UserEditorDefaults) {
  const rawBrandIds =
    user?.brandIds ?? user?.brands?.map((brand) => brand.id.toString()) ?? [];

  return Array.from(
    new Set(rawBrandIds.filter((brandId) => /^\d+$/.test(brandId))),
  );
}
