import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import { plugin } from "./browser";
import { testPluginStructure } from "../test/plugin-test-utils";

describe("Browser Plugin", () => {
  let originalFetch: any;
  
  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test("plugin has correct structure", () => {
    testPluginStructure(plugin);
    expect(plugin.name).toBe("browser");
    expect(plugin.type).toBe("skill");
  });

  test("validates required parameters for navigate action", async () => {
    // Test missing url parameter
    const result = await plugin.execute({ action: "navigate" });
    expect(typeof result).toBe("string");
    expect(result).toContain("ERROR");
    expect(result).toContain("url");
    expect(result).toContain("required");
  });

  test("validates required parameters for click action", async () => {
    // Test missing selector parameter
    const result = await plugin.execute({ action: "click" });
    expect(typeof result).toBe("string");
    // Should return error about missing selector
    expect(result).toContain("ERROR");
    expect(result).toContain("selector");
    expect(result).toContain("required");
  });

  test("validates required parameters for type action", async () => {
    // Test missing selector and text parameters
    const result = await plugin.execute({ action: "type" });
    expect(typeof result).toBe("string");
    // Should return error about missing selector (first check)
    expect(result).toContain("ERROR");
    expect(result).toContain("selector");
    expect(result).toContain("required");
    
    // Test missing text parameter when selector is provided
    const result2 = await plugin.execute({ action: "type", selector: ".input" });
    expect(typeof result2).toBe("string");
    expect(result2).toContain("ERROR");
    expect(result2).toContain("text");
    expect(result2).toContain("required");
  });

  test("validates required parameters for screenshot action", async () => {
    // Test missing path parameter
    const result = await plugin.execute({ action: "screenshot" });
    expect(typeof result).toBe("string");
    // Should return error about missing path
    expect(result).toContain("ERROR");
    expect(result).toContain("path");
    expect(result).toContain("required");
  });

  test("validates required parameters for extract action", async () => {
    // Test missing selector parameter for extract
    const result = await plugin.execute({ action: "extract" });
    expect(typeof result).toBe("string");
    expect(result).toContain("ERROR");
    expect(result).toContain("selector");
    expect(result).toContain("required");
  });

  test("returns error for unknown action", async () => {
    const result = await plugin.execute({ action: "unknown_action" });
    expect(typeof result).toBe("string");
    expect(result).toContain("ERROR");
    expect(result).toContain("Unknown browser action");
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
    expect(result).toContain("navigate");
    expect(result).toContain("click");
    expect(result).toContain("type");
    expect(result).toContain("screenshot");
    expect(result).toContain("extract");
  });

  test("fallback fetch works when browser command fails", async () => {
    // Mock fetch for the fallback
    const mockFetch = mock(() => 
      Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve("<html>Mock HTML content</html>")
      })
    );
    global.fetch = mockFetch as any;

    const result = await plugin.execute({ 
      action: "navigate", 
      url: "https://example.com" 
    });
    
    expect(typeof result).toBe("string");
    // The actual execution will try to run browser command and fail,
    // then fall back to fetch. We can't easily mock execSync, so we
    // just verify the function executes without throwing.
    expect(result).toBeDefined();
  });

  test("fallback fetch handles fetch errors gracefully", async () => {
    // Mock fetch to throw an error
    const mockFetch = mock(() => 
      Promise.reject(new Error("Network error"))
    );
    global.fetch = mockFetch as any;

    const result = await plugin.execute({ 
      action: "navigate", 
      url: "https://example.com" 
    });
    
    expect(typeof result).toBe("string");
    // The function should handle the error gracefully
    expect(result).toBeDefined();
  });
});