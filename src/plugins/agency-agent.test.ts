import { describe, test, expect } from "bun:test";
import { plugin } from "./agency-agent";
import { testPluginStructure } from "../test/plugin-test-utils";

describe("Agency Agent Plugin", () => {
  test("plugin has correct structure", () => {
    testPluginStructure(plugin);
    expect(plugin.name).toBe("agency-agent");
    expect(plugin.type).toBe("skill");
  });

  test("validates required parameters for delegate_task", async () => {
    const result = await plugin.execute({ action: "delegate_task" });
    expect(typeof result).toBe("string");
    expect(result).toContain("ERROR");
    expect(result).toContain("'message' parameter is required");
  });

  test("returns error for unknown action", async () => {
    const result = await plugin.execute({ action: "unknown_action" });
    expect(typeof result).toBe("string");
    expect(result).toContain("ERROR");
    expect(result).toContain("Unknown action");
  });

  test("delegate_task executes successfully", async () => {
    // The agency agent returns a JSON response containing the message
    const result = await plugin.execute({ action: "delegate_task", message: "Hello agency!" });
    expect(typeof result).toBe("string");

    // Parse the result to ensure it's valid JSON
    const jsonResult = JSON.parse(result as string);
    expect(jsonResult.status).toBe("success");
    expect(jsonResult.processed_message).toBe("Hello agency!");
    expect(jsonResult.reply).toContain("Hello agency!");
  });
});
