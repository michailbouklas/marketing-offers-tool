import { describe, expect, it } from "vitest";
import {
  createCompanyFormSchema,
  editCompanyFormSchema,
  normalizeBrandIds,
} from "./companies";

describe("createCompanyFormSchema", () => {
  it("maps blank optional text fields to null and defaults active to false", () => {
    const parsed = createCompanyFormSchema.parse({
      name: "Acme",
      registrationNumber: "",
      vatNumber: "",
    });
    expect(parsed).toEqual({
      name: "Acme",
      registrationNumber: null,
      vatNumber: null,
      sapDatabaseId: null,
      active: false,
      brandIds: [],
    });
  });

  it("defaults brandIds to an empty list when the form sends none", () => {
    expect(createCompanyFormSchema.parse({ name: "Acme" }).brandIds).toEqual(
      [],
    );
  });

  it("passes brand ids through as the strings the checkboxes posted", () => {
    expect(
      createCompanyFormSchema.parse({ name: "Acme", brandIds: ["5", "7"] })
        .brandIds,
    ).toEqual(["5", "7"]);
  });

  it("rejects a non-numeric brand id", () => {
    expect(
      createCompanyFormSchema.safeParse({ name: "Acme", brandIds: ["x"] })
        .success,
    ).toBe(false);
  });

  it("requires a name", () => {
    expect(createCompanyFormSchema.safeParse({ name: "" }).success).toBe(false);
    expect(createCompanyFormSchema.safeParse({}).success).toBe(false);
  });
});

describe("editCompanyFormSchema", () => {
  it("coerces the id to a positive integer", () => {
    const parsed = editCompanyFormSchema.parse({ id: "5", name: "Acme" });
    expect(parsed.id).toBe(5);
  });

  it("rejects a non-positive id", () => {
    expect(
      editCompanyFormSchema.safeParse({ id: "0", name: "Acme" }).success,
    ).toBe(false);
  });
});

describe("normalizeBrandIds", () => {
  it("dedupes and drops non-integer values", () => {
    expect(normalizeBrandIds(["5", "7", "7", "9"])).toEqual([5, 7, 9]);
  });

  it("returns an empty list for no input", () => {
    expect(normalizeBrandIds([])).toEqual([]);
  });
});
