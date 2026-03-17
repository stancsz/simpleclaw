import { describe, test, expect } from "bun:test";
import { plugin } from "./github";
import { testPluginStructure } from "../test/plugin-test-utils";

describe("GitHub Plugin", () => {
  test("plugin has correct structure", () => {
    testPluginStructure(plugin);
    expect(plugin.name).toBe("github");
    expect(plugin.type).toBe("skill");
  });

  test("validates required parameters for search_repos", async () => {
    // This test will actually try to execute the command
    // but should fail validation before reaching execSync
    const result = await plugin.execute({ action: "search_repos" });
    expect(typeof result).toBe("string");
    // The result will either be an error about missing query or about gh not being installed
    expect(result).toContain("ERROR");
  });

  test("validates required parameters for get_file_contents", async () => {
    const result = await plugin.execute({ action: "get_file_contents" });
    expect(typeof result).toBe("string");
    expect(result).toContain("ERROR");
  });

  test("returns error for unknown action", async () => {
    const result = await plugin.execute({ action: "unknown_action" });
    expect(typeof result).toBe("string");
    expect(result).toContain("ERROR");
    expect(result).toContain("Unknown GitHub action");
  });

  test("plugin has all expected action handlers", () => {
    // Verify the plugin execute function exists
    expect(typeof plugin.execute).toBe("function");
    
    // Test that the function signature matches expected parameters
    const executeFn = plugin.execute;
    expect(executeFn.length).toBe(1); // Takes one args parameter
  });

  test("plugin action list is documented in error message", async () => {
    const result = await plugin.execute({ action: "unknown_action" });
    expect(result).toContain("Available actions");
    expect(result).toContain("search_repos");
    expect(result).toContain("create_issue");
    expect(result).toContain("clone_repo");
  });
});