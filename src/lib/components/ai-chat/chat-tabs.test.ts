import { describe, expect, it } from "vitest";
import { nextActiveAfterClose } from "./chat-tabs";

describe("nextActiveAfterClose", () => {
  const keys = ["a", "b", "c"];

  it("keeps the focused tab when another one closes", () => {
    expect(nextActiveAfterClose(keys, "a", "c")).toBe("a");
  });

  it("focuses the right neighbour of a closed focused tab", () => {
    expect(nextActiveAfterClose(keys, "b", "b")).toBe("c");
  });

  it("falls back to the left neighbour for the last tab in the row", () => {
    expect(nextActiveAfterClose(keys, "c", "c")).toBe("b");
  });

  it("returns undefined when the only tab closes", () => {
    expect(nextActiveAfterClose(["a"], "a", "a")).toBeUndefined();
  });
});
