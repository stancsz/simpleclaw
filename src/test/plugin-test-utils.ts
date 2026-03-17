import { mock, expect } from "bun:test";
import type { Extension } from "../core/extensions";

/**
 * Test utilities for plugin testing
 */

export interface MockExecResult {
  stdout?: string;
  stderr?: string;
  error?: Error;
}

export interface MockExecConfig {
  commands: Map<string, MockExecResult>;
  defaultResult?: MockExecResult;
}

/**
 * Creates a mock execSync function for testing CLI-based plugins
 */
export function createMockExecSync(config: MockExecConfig) {
  return (command: string, options?: any) => {
    // Check for exact command match
    if (config.commands.has(command)) {
      const result = config.commands.get(command)!;
      if (result.error) {
        throw result.error;
      }
      return result.stdout || "";
    }

    // Check for command prefix match
    for (const [cmdPattern, result] of config.commands.entries()) {
      if (command.startsWith(cmdPattern)) {
        if (result.error) {
          throw result.error;
        }
        return result.stdout || "";
      }
    }

    // Use default result if provided
    if (config.defaultResult) {
      if (config.defaultResult.error) {
        throw config.defaultResult.error;
      }
      return config.defaultResult.stdout || "";
    }

    // Default: command not found
    const error = new Error(`Command failed: ${command}`);
    (error as any).stderr = "command not found";
    throw error;
  };
}

/**
 * Creates a mock exec function for testing async CLI-based plugins
 */
export function createMockExec(config: MockExecConfig) {
  return async (command: string, options?: any) => {
    // Check for exact command match
    if (config.commands.has(command)) {
      const result = config.commands.get(command)!;
      if (result.error) {
        throw result.error;
      }
      return { stdout: result.stdout || "", stderr: result.stderr || "" };
    }

    // Check for command prefix match
    for (const [cmdPattern, result] of config.commands.entries()) {
      if (command.startsWith(cmdPattern)) {
        if (result.error) {
          throw result.error;
        }
        return { stdout: result.stdout || "", stderr: result.stderr || "" };
      }
    }

    // Use default result if provided
    if (config.defaultResult) {
      if (config.defaultResult.error) {
        throw config.defaultResult.error;
      }
      return { 
        stdout: config.defaultResult.stdout || "", 
        stderr: config.defaultResult.stderr || "" 
      };
    }

    // Default: command not found
    const error = new Error(`Command failed: ${command}`);
    (error as any).stderr = "command not found";
    throw error;
  };
}

/**
 * Helper to test plugin structure and basic functionality
 */
export function testPluginStructure(plugin: Extension) {
  expect(plugin).toBeDefined();
  expect(plugin.name).toBeDefined();
  expect(plugin.type).toBeDefined();
  expect(typeof plugin.execute).toBe("function");
}

/**
 * Helper to test plugin action validation
 */
export async function testPluginActionValidation(
  plugin: Extension,
  action: string,
  requiredParams: string[] = []
) {
  // Test missing required parameters
  const missingParamsResult = await plugin.execute({ action });
  
  if (requiredParams.length > 0) {
    expect(missingParamsResult).toContain("ERROR");
    requiredParams.forEach(param => {
      expect(missingParamsResult).toContain(param);
    });
  }
  
  // Test unknown action
  const unknownActionResult = await plugin.execute({ action: "unknown_action" });
  expect(unknownActionResult).toContain("ERROR");
  expect(unknownActionResult).toContain("Unknown");
}

/**
 * Helper to create test plugin context
 */
export function createTestPluginContext() {
  return {
    mode: "test" as const,
    taskKind: "interactive" as const,
    prompt: "test plugin",
    memoryContext: "",
    skillsContext: "",
    platform: process.platform,
    dispatcher: {
      submit: async () => ({ content: "", iterations: 0, messages: [], completed: true })
    }
  };
}

/**
 * Mock console.log to capture plugin output
 */
export function captureConsoleLog() {
  const logs: string[] = [];
  const originalLog = console.log;
  
  console.log = (...args: any[]) => {
    logs.push(args.map(arg => String(arg)).join(" "));
    originalLog(...args);
  };
  
  return {
    logs,
    restore: () => {
      console.log = originalLog;
    }
  };
}

/**
 * Mock console.error to capture plugin errors
 */
export function captureConsoleError() {
  const errors: string[] = [];
  const originalError = console.error;
  
  console.error = (...args: any[]) => {
    errors.push(args.map(arg => String(arg)).join(" "));
    originalError(...args);
  };
  
  return {
    errors,
    restore: () => {
      console.error = originalError;
    }
  };
}