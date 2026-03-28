import { describe, test, expect } from "bun:test";
import { plugin } from "./opencli";
import { testPluginStructure } from "../test/plugin-test-utils";

describe("OpenCLI Plugin", () => {
  test("plugin has correct structure", () => {
    testPluginStructure(plugin);
    expect(plugin.name).toBe("opencli");
    expect(plugin.type).toBe("skill");
  });

  test("validates unknown actions", async () => {
    const result = await plugin.execute({ action: "unknown_action" });
    expect(typeof result).toBe("string");
    expect(result).toContain("ERROR: Unknown opencli action: unknown_action");
    expect(result).toContain("Available actions: run");
  });

  test("validates required command parameter", async () => {
    const result = await plugin.execute({ action: "run" });
    expect(typeof result).toBe("string");
    expect(result).toContain("ERROR: 'command' parameter is required for opencli run");
  });

  // We can't strictly mock execSync inside this test without dependency injection or `mock.module`
  // But verifying argument checking is good.
});
