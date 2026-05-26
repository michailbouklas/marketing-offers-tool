import { describe, expect, it } from "vitest";
import { FakeProvider, type GenerateInput } from "./types";

describe("FakeProvider", () => {
  it("round-trips the prompt and dimensions through generateImage", async () => {
    const provider = new FakeProvider();

    const out = await provider.generateImage({
      prompt: "a red cube on a blue plinth",
      width: 1024,
      height: 1024,
    });

    expect(out.bytes).toBeInstanceOf(Buffer);
    const decoded = out.bytes.toString("utf8");
    expect(decoded).toContain("a red cube on a blue plinth");
    expect(decoded).toContain("1024x1024");
    expect(out.providerMetadata).toMatchObject({ provider: "fake" });
  });

  it("records every call when a sink array is supplied", async () => {
    const calls: GenerateInput[] = [];
    const provider = new FakeProvider({ recordCalls: calls });

    await provider.generateImage({
      prompt: "p1",
      width: 100,
      height: 200,
      model: "fake-x",
      references: ["ref-1", "ref-2"],
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      prompt: "p1",
      width: 100,
      height: 200,
      model: "fake-x",
      references: ["ref-1", "ref-2"],
    });
  });

  it("returns the configured bytes when provided", async () => {
    const custom = Buffer.from([1, 2, 3, 4]);
    const provider = new FakeProvider({ bytes: custom });

    const out = await provider.generateImage({
      prompt: "ignored",
      width: 1,
      height: 1,
    });

    expect(out.bytes).toBe(custom);
  });

  it("throws when configured to fail", async () => {
    const provider = new FakeProvider({
      error: new Error("provider boom"),
    });

    await expect(
      provider.generateImage({ prompt: "x", width: 1, height: 1 }),
    ).rejects.toThrow("provider boom");
  });
});
