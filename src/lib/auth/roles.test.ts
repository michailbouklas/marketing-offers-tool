import { describe, expect, it } from "vitest";
import { hasAnyRole, isAdminRole, parseRoles } from "./roles";

describe("parseRoles", () => {
  it("returns an empty list for nullish input", () => {
    expect(parseRoles(null)).toEqual([]);
    expect(parseRoles(undefined)).toEqual([]);
    expect(parseRoles("")).toEqual([]);
  });

  it("parses a single role", () => {
    expect(parseRoles("admin")).toEqual(["admin"]);
  });

  it("parses a comma-separated, whitespace-padded list", () => {
    expect(parseRoles("admin, approver ,user")).toEqual([
      "admin",
      "approver",
      "user",
    ]);
  });

  it("drops unknown roles", () => {
    expect(parseRoles("admin,superhero")).toEqual(["admin"]);
  });
});

describe("isAdminRole", () => {
  it("is true for the admin role", () => {
    expect(isAdminRole("admin")).toBe(true);
  });

  it("is true when admin appears within a multi-role string", () => {
    expect(isAdminRole("approver,admin")).toBe(true);
  });

  it("is false for non-admin roles and nullish input", () => {
    expect(isAdminRole("user")).toBe(false);
    expect(isAdminRole("approver")).toBe(false);
    expect(isAdminRole(null)).toBe(false);
    expect(isAdminRole(undefined)).toBe(false);
  });
});

describe("hasAnyRole", () => {
  it("is true when a single role is in the allowed list", () => {
    expect(hasAnyRole("offerEditor", ["offerEditor", "superUser"])).toBe(true);
  });

  it("is true when any role within a multi-role string is allowed", () => {
    expect(hasAnyRole("user,imageEditor", ["admin", "imageEditor"])).toBe(true);
  });

  it("is false when none of the user's roles are allowed", () => {
    expect(hasAnyRole("user", ["offerEditor", "superUser"])).toBe(false);
    expect(hasAnyRole("admin", ["offerEditor"])).toBe(false);
  });

  it("is false for nullish input", () => {
    expect(hasAnyRole(null, ["admin"])).toBe(false);
    expect(hasAnyRole(undefined, ["admin"])).toBe(false);
  });
});
