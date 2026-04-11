import { describe, it, expect } from "vitest";

describe("@financas/shared", () => {
  it("placeholder: module loads without error", async () => {
    // This test confirms the barrel export is importable.
    // Replace with real tests as exports are added.
    const mod = await import("../index.js");
    expect(mod).toBeDefined();
  });
});
