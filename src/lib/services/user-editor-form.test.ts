import { describe, expect, it } from "vitest";
import {
  createUserFormSchema,
  getDefaultCreateUserFormData,
  getDefaultEditUserFormData,
} from "./user-editor-form";

describe("user-editor-form", () => {
  it("defaults brand selections to an empty list", () => {
    expect(getDefaultCreateUserFormData()).toMatchObject({
      brandIds: [],
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
    });
  });

  it("accepts repeated brand ids in the submitted payload", () => {
    const parsed = createUserFormSchema.parse({
      name: "Alex",
      email: "alex@example.com",
      password: "password123",
      role: "user",
      brandIds: ["3", "7"],
    });

    expect(parsed.brandIds).toEqual(["3", "7"]);
  });
});
