import { describe, expect, it } from "vitest";
import {
  canAccessAdminSection,
  competitionRoles,
  googleReviewsRoles,
  hasAnyRole,
  isAdminRole,
  parseRoles,
} from "./roles";

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

describe("canAccessAdminSection", () => {
  it("is true for the marker admin roles", () => {
    expect(canAccessAdminSection("admin")).toBe(true);
    expect(canAccessAdminSection("superUser")).toBe(true);
  });

  it("is true for capability roles whose tools live under /admin", () => {
    expect(canAccessAdminSection("brandManager")).toBe(true);
    expect(canAccessAdminSection("approver")).toBe(true);
    expect(canAccessAdminSection("usageViewer")).toBe(true);
    expect(canAccessAdminSection("userManager")).toBe(true);
  });

  it("is true when an admin-section role appears within a multi-role string", () => {
    expect(canAccessAdminSection("user,imageEditor,brandManager")).toBe(true);
  });

  it("is false for roles with no /admin tools and for nullish input", () => {
    expect(canAccessAdminSection("user")).toBe(false);
    expect(canAccessAdminSection("imageEditor")).toBe(false);
    expect(canAccessAdminSection("offerEditor")).toBe(false);
    expect(canAccessAdminSection("user,imageEditor")).toBe(false);
    expect(canAccessAdminSection(null)).toBe(false);
    expect(canAccessAdminSection(undefined)).toBe(false);
  });

  it("is false for analyticsViewer (competition is not under /admin)", () => {
    expect(canAccessAdminSection("analyticsViewer")).toBe(false);
  });
});

describe("competitionRoles", () => {
  it("grants the competition section to analyticsViewer and superUser only", () => {
    expect(hasAnyRole("analyticsViewer", competitionRoles)).toBe(true);
    expect(hasAnyRole("superUser", competitionRoles)).toBe(true);
    expect(hasAnyRole("user,analyticsViewer", competitionRoles)).toBe(true);
    expect(hasAnyRole("admin", competitionRoles)).toBe(false);
    expect(hasAnyRole("user", competitionRoles)).toBe(false);
    expect(hasAnyRole(null, competitionRoles)).toBe(false);
  });
});

describe("googleReviewsRoles", () => {
  it("grants the google-reviews section to analyticsViewer and superUser only", () => {
    expect(hasAnyRole("analyticsViewer", googleReviewsRoles)).toBe(true);
    expect(hasAnyRole("superUser", googleReviewsRoles)).toBe(true);
    expect(hasAnyRole("user,analyticsViewer", googleReviewsRoles)).toBe(true);
    expect(hasAnyRole("admin", googleReviewsRoles)).toBe(false);
    expect(hasAnyRole("user", googleReviewsRoles)).toBe(false);
    expect(hasAnyRole(null, googleReviewsRoles)).toBe(false);
  });
});
