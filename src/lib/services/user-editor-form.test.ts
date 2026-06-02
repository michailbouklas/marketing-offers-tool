import { describe, expect, it } from "vitest";
import {
  createUserFormSchema,
  getDefaultCreateUserFormData,
  getDefaultEditUserFormData,
} from "./user-editor-form";

describe("user-editor-form", () => {
  it("defaults brand selections to an empty list and role to user", () => {
    expect(getDefaultCreateUserFormData()).toMatchObject({
      brandIds: [],
      roles: ["user"],
    });
  });

  it("maps user brand relations into editable brand ids", () => {
    expect(
      getDefaultEditUserFormData({
        id: "user-1",
        name: "Alex",
        email: "alex@example.com",
        role: "admin",
        brands: [{ id: 3 }, { id: 7 }],
      }),
    ).toMatchObject({
      userId: "user-1",
      brandIds: ["3", "7"],
      roles: ["admin"],
    });
  });

  it("parses a comma-separated legacy role string into multiple roles", () => {
    expect(
      getDefaultEditUserFormData({
        id: "user-2",
        role: "admin,approver",
      }).roles,
    ).toEqual(["admin", "approver"]);
  });

  it("prefers an explicit roles array over the legacy role field", () => {
    expect(
      getDefaultEditUserFormData({
        id: "user-3",
        role: "admin",
        roles: ["user", "approver"],
      }).roles,
    ).toEqual(["user", "approver"]);
  });

  it("falls back to the default role when none are recognised", () => {
    expect(
      getDefaultEditUserFormData({ id: "user-4", role: "ghost" }).roles,
    ).toEqual(["user"]);
  });

  it("accepts repeated brand ids and multiple roles in the submitted payload", () => {
    const parsed = createUserFormSchema.parse({
      name: "Alex",
      email: "alex@example.com",
      password: "password123",
      roles: ["admin", "approver"],
      brandIds: ["3", "7"],
    });

    expect(parsed.brandIds).toEqual(["3", "7"]);
    expect(parsed.roles).toEqual(["admin", "approver"]);
  });

  it("coerces a single posted role string into an array", () => {
    const parsed = createUserFormSchema.parse({
      name: "Alex",
      email: "alex@example.com",
      password: "password123",
      roles: "approver",
      brandIds: [],
    });

    expect(parsed.roles).toEqual(["approver"]);
  });

  it("rejects a submission with no roles selected", () => {
    const result = createUserFormSchema.safeParse({
      name: "Alex",
      email: "alex@example.com",
      password: "password123",
      brandIds: [],
    });

    expect(result.success).toBe(false);
  });
});
