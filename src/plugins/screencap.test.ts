import { describe, test, expect } from "bun:test";
import { plugin } from "./screencap.ts";
import { testPluginStructure } from "../test/plugin-test-utils.ts";

describe("Screen Capture Plugin", () => {
  test("plugin has correct structure", () => {
    testPluginStructure(plugin);
    expect(plugin.name).toBe("screencap");
    expect(plugin.type).toBe("skill");
  });

  test("supports list_displays action", async () => {
    const result = await plugin.execute({ action: "list_displays" });
    expect(typeof result).toBe("object");
    expect(result).toHaveProperty("success");
    expect(result).toHaveProperty("message");
    
    // The actual result depends on the system, but structure should be consistent
    if (result.success) {
      expect(result).toHaveProperty("displays");
      expect(result).toHaveProperty("count");
      expect(result).toHaveProperty("platform");
      expect(Array.isArray(result.displays)).toBe(true);
      expect(typeof result.count).toBe("number");
      expect(typeof result.platform).toBe("string");
    } else {
      expect(result).toHaveProperty("message");
      expect(typeof result.message).toBe("string");
    }
  });

  test("supports capture_screen action", async () => {
    const result = await plugin.execute({ action: "capture_screen" });
    expect(typeof result).toBe("object");
    expect(result).toHaveProperty("success");
    expect(result).toHaveProperty("message");
    
    // The actual result depends on the system
    if (result.success) {
      expect(result).toHaveProperty("filePath");
      expect(typeof result.filePath).toBe("string");
      expect(result).toHaveProperty("size");
      expect(typeof result.size).toBe("number");
    } else {
      expect(result).toHaveProperty("message");
      expect(typeof result.message).toBe("string");
    }
  });

  test("supports capture_display action with display_id", async () => {
    const result = await plugin.execute({ action: "capture_display", display_id: "0" });
    expect(typeof result).toBe("object");
    expect(result).toHaveProperty("success");
    expect(result).toHaveProperty("message");
    
    // The actual result depends on the system
    if (result.success) {
      expect(result).toHaveProperty("filePath");
      expect(typeof result.filePath).toBe("string");
    } else {
      expect(result).toHaveProperty("message");
      expect(typeof result.message).toBe("string");
    }
  });

  test("returns error for unknown action", async () => {
    const result = await plugin.execute({ action: "unknown_action" });
    expect(typeof result).toBe("object");
    expect(result.success).toBe(false);
    expect(result).toHaveProperty("message");
    expect(result.message).toContain("Unknown action");
  });

  test("plugin has correct runtime modes", () => {
    expect(plugin.runtimeModes).toBeDefined();
    expect(Array.isArray(plugin.runtimeModes)).toBe(true);
    expect(plugin.runtimeModes).toContain("cli");
    expect(plugin.runtimeModes).toContain("hybrid");
    expect(plugin.runtimeModes).toContain("server");
  });
});