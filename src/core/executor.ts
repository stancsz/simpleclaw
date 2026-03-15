import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { extensionRegistry } from "./extensions.ts";
import type { CapabilityCatalog, CapabilityExecutionContext, CapabilityResult } from "./capabilities.ts";
import {
  canExecuteCapability,
  getStructuredCapabilityDenial,
  getStructuredCapabilityDisabled,
  getStructuredCapabilityUnknown,
} from "./policy.ts";

const legacyBridge = {
  dispatch: (toolName: string, args: any) => {
    return `Legacy fallback for ${toolName} with args: ${JSON.stringify(args)}`;
  },
};

const stripAnsi = (str: string) =>
  str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, "");

export interface CapabilityExecutorDependencies {
  catalog: CapabilityCatalog;
}

export type CapabilityExecutionOutcomeKind = "success" | "unknown" | "disabled" | "denied" | "runtime_failure";

export interface CapabilityExecutionOutcome {
  ok: boolean;
  kind: CapabilityExecutionOutcomeKind;
  status: "completed" | "blocked" | "partial";
  output: string;
  message?: string;
  data?: unknown;
}

export function createCapabilityExecutor(dependencies: CapabilityExecutorDependencies) {
  const { catalog } = dependencies;

  return {
    execute: async (
      capabilityName: string,
      args: Record<string, unknown>,
      context: CapabilityExecutionContext,
    ): Promise<CapabilityExecutionOutcome> => {
      const capability = catalog.get(capabilityName);
      if (!capability) {
        return {
          ok: false,
          kind: "unknown",
          status: "blocked",
          output: getStructuredCapabilityUnknown(capabilityName),
          message: `Unknown capability: ${capabilityName}`,
        };
      }

      const decision = canExecuteCapability(capability, context.runtime);
      if (decision.status === "disabled") {
        return {
          ok: false,
          kind: "disabled",
          status: "blocked",
          output: getStructuredCapabilityDisabled(capabilityName, decision.reason),
          message: decision.reason,
        };
      }

      if (decision.status === "denied") {
        return {
          ok: false,
          kind: "denied",
          status: "blocked",
          output: getStructuredCapabilityDenial(capabilityName, decision.reason),
          message: decision.reason,
        };
      }

      try {
        const result = await capability.handler(args, context);
        return normalizeCapabilityResult(result);
      } catch (error: any) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          ok: false,
          kind: "runtime_failure",
          status: "blocked",
          output: `TOOL_ERROR: ${message}`,
          message,
        };
      }
    },
    executeLegacy: async (toolName: string, args: Record<string, unknown>) => {
      const result = await executeNativeTool(toolName, args);
      return normalizeCapabilityResult({
        status: "completed",
        content: typeof result === "string" ? result : JSON.stringify(result),
        data: result,
      });
    },
  };
}

function normalizeCapabilityResult(result: CapabilityResult): CapabilityExecutionOutcome {
  return {
    ok: result.status !== "blocked",
    kind: result.status === "blocked" ? "runtime_failure" : "success",
    status: result.status,
    output: typeof result.content === "string" ? stripAnsi(result.content) : JSON.stringify(result.content),
    data: result.data,
  };
}

export async function executeNativeTool(toolName: string, args: any) {
  if (/sudo/i.test(JSON.stringify(args))) return "DENIED: Sudo usage restricted for safety.";

  const handlers: any = {
    read: (p: string) => readFileSync(p, "utf-8"),
    write: (p: string, c: string) => {
      writeFileSync(p, c);
      return `Successfully wrote to ${p}`;
    },
    shell: (c: string) => execSync(c).toString(),
    git: (m: string) => execSync(`git commit -m "${m}"`).toString(),
    browser: async (input: Record<string, unknown>) => {
      const extension = extensionRegistry.get("browser");
      if (!extension) {
        throw new Error("browser extension not available");
      }
      return await extension.execute(input);
    },
  };

  const result = (
    (await handlers[toolName]?.(args.path || args.cmd || args.msg || args, args.content)) ??
    (await extensionRegistry.execute(toolName, args).catch(() => null)) ??
    legacyBridge.dispatch(toolName, args)
  );

  return typeof result === "string" ? stripAnsi(result) : result;
}
