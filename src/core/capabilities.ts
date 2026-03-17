import type { RuntimeMode } from "./extensions";
import type { AgentDispatcher, RuntimeDispatchEvent } from "./dispatcher";
import type { AgentTaskKind } from "./policy";

export type CapabilityCategory = "native" | "extension" | "worker" | "meta";
export type CapabilityApprovalClass = "default" | "memory" | "network" | "delegate" | "restricted";
export type CapabilityVisibility = "hidden" | "visible";
export type CapabilityExecutionStatus = "allowed" | "denied" | "disabled" | "unknown";

export interface CapabilitySchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
}

export interface RuntimeCapabilityContext {
  mode: RuntimeMode;
  taskKind: AgentTaskKind;
  source?: string;
  prompt: string;
  memoryContext: string;
  soulContext: string;
  skillsContext: string;
  platform: string;
  dispatcher: AgentDispatcher;
  emitRuntimeEvent?: (event: RuntimeDispatchEvent) => Promise<void> | void;
}

export interface CapabilityExecutionContext {
  runtime: RuntimeCapabilityContext;
}

export interface CapabilityResult {
  status: "completed" | "blocked" | "partial";
  content: string;
  data?: unknown;
}

export interface CapabilityDefinition {
  name: string;
  description: string;
  inputSchema: CapabilitySchema;
  category: CapabilityCategory;
  runtimeModes?: RuntimeMode[];
  approvalClass: CapabilityApprovalClass;
  handler: (args: Record<string, unknown>, context: CapabilityExecutionContext) => Promise<CapabilityResult>;
}

export interface CapabilityCatalog {
  get: (name: string) => CapabilityDefinition | undefined;
  getAll: () => CapabilityDefinition[];
  getVisibleForModel: (context: RuntimeCapabilityContext) => CapabilityDefinition[];
}

export interface CapabilityToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: CapabilitySchema;
  };
}

export function createCapabilityCatalog(capabilities: CapabilityDefinition[]): CapabilityCatalog {
  const byName = new Map(capabilities.map((capability) => [capability.name, capability]));

  return {
    get: (name) => byName.get(name),
    getAll: () => [...byName.values()],
    getVisibleForModel: (context) =>
      capabilities.filter((capability) => {
        if (capability.runtimeModes && capability.runtimeModes.length > 0) {
          return capability.runtimeModes.includes(context.mode);
        }
        return true;
      }),
  };
}

export function capabilityToToolDefinition(capability: CapabilityDefinition): CapabilityToolDefinition {
  return {
    type: "function",
    function: {
      name: capability.name,
      description: capability.description,
      parameters: capability.inputSchema,
    },
  };
}
