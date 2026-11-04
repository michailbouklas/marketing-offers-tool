import { describe, expect, it } from "vitest";
import { isGroup, visibleNavItems } from "./nav-items";

function adminLinks(role: string) {
  const admin = visibleNavItems(role, { adminChildren: true }).find(
    (item) => item.href === "/admin",
  );
  return admin && isGroup(admin)
    ? admin.children.map((child) => child.href)
    : null;
}

describe("visibleNavItems", () => {
  it("hides Admin from plain users", () => {
    expect(adminLinks("user")).toBeNull();
  });

  it("lists only the admin tools a role is permitted", () => {
    const links = adminLinks("brandManager");
    expect(links).toContain("/admin/brands");
    expect(links).toContain("/admin/recipes");
    expect(links).not.toContain("/admin/users");
    expect(links).not.toContain("/admin/live-monitoring");
  });

  it("unions permissions across comma-separated roles", () => {
    expect(adminLinks("brandManager,approver")).toContain(
      "/admin/pending-submissions",
    );
  });

  it("gives superUser every admin tool", () => {
    expect(adminLinks("superUser")).toHaveLength(16);
  });

  // The command palette uses href as each item's unique value.
  it("never repeats a palette href", () => {
    const hrefs = visibleNavItems("superUser", { adminChildren: true }).flatMap(
      (item) =>
        isGroup(item) ? item.children.map((child) => child.href) : [item.href],
    );
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("keeps Admin a single link for the sidebar", () => {
    const admin = visibleNavItems("superUser").find(
      (item) => item.href === "/admin",
    );
    expect(admin && isGroup(admin)).toBe(false);
  });
});
