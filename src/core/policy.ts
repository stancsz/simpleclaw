import type {
  CapabilityApprovalClass,
  CapabilityDefinition,
  CapabilityExecutionStatus,
  RuntimeCapabilityContext,
} from "./capabilities";

export type AgentTaskKind = "interactive" | "autonomous";

export interface AgentPolicyContext {
  source?: string;
  prompt: string;
}

export interface AgentPromptProfile {
  kind: AgentTaskKind;
  systemPrompt: string;
}

export interface CapabilityVisibilityDecision {
  visible: boolean;
  reason: string;
}

export interface CapabilityExecutionDecision {
  status: CapabilityExecutionStatus;
  reason: string;
}

const SIMPLE_CONVERSATIONAL_PATTERN = /^(hi|hello|hey|thanks|thank you|what is my name\??|who am i\??)$/i;
const DEFAULT_ALLOWED_APPROVAL_CLASSES: CapabilityApprovalClass[] = ["default", "memory", "network", "delegate"];
const DEFAULT_APPROVED_CAPABILITIES = new Set(["read", "remember", "browser", "delegate_to_opencode"]);

export function resolveAgentTaskKind(context: AgentPolicyContext): AgentTaskKind {
  return context.source === "heartbeat" ? "autonomous" : "interactive";
}

export function shouldPreferDirectResponse(context: AgentPolicyContext): boolean {
  const prompt = context.prompt.trim();
  if (!prompt) {
    return true;
  }

  if (SIMPLE_CONVERSATIONAL_PATTERN.test(prompt)) {
    return true;
  }

  return prompt.split(/\s+/).length <= 6 && !/[/.]|https?:\/\//i.test(prompt);
}

export function shouldEnableBootstrapProtocol(kind: AgentTaskKind): boolean {
  return kind === "autonomous";
}

export function shouldAllowMemoryWrite(kind: AgentTaskKind, toolName: string): boolean {
  if (toolName !== "remember") {
    return true;
  }

  return kind === "autonomous";
}

export function isCapabilityEnabled(
  capability: CapabilityDefinition,
  context: RuntimeCapabilityContext,
): CapabilityExecutionDecision {
  if (!DEFAULT_ALLOWED_APPROVAL_CLASSES.includes(capability.approvalClass)) {
    return { status: "disabled", reason: `approval class ${capability.approvalClass} is not enabled` };
  }

  if (capability.runtimeModes && capability.runtimeModes.length > 0 && !capability.runtimeModes.includes(context.mode)) {
    return { status: "disabled", reason: `disabled in runtime mode ${context.mode}` };
  }

  if (!DEFAULT_APPROVED_CAPABILITIES.has(capability.name)) {
    return { status: "disabled", reason: "capability is outside the approved default surface" };
  }

  if (capability.name === "remember" && !shouldAllowMemoryWrite(context.taskKind, capability.name)) {
    return { status: "disabled", reason: "memory writes are disabled for this task kind" };
  }

  return { status: "allowed", reason: "enabled by runtime policy" };
}

export function getCapabilityVisibility(
  capability: CapabilityDefinition,
  context: RuntimeCapabilityContext,
): CapabilityVisibilityDecision {
  const enabledDecision = isCapabilityEnabled(capability, context);
  if (enabledDecision.status !== "allowed") {
    return { visible: false, reason: enabledDecision.reason };
  }

  if (capability.approvalClass === "restricted") {
    return { visible: false, reason: "restricted capabilities are hidden from the model" };
  }

  return { visible: true, reason: "capability is visible to the model" };
}

export function canExecuteCapability(
  capability: CapabilityDefinition,
  context: RuntimeCapabilityContext,
): CapabilityExecutionDecision {
  const enabledDecision = isCapabilityEnabled(capability, context);
  if (enabledDecision.status !== "allowed") {
    return enabledDecision;
  }

  if (capability.approvalClass === "memory" && !shouldAllowMemoryWrite(context.taskKind, capability.name)) {
    return { status: "denied", reason: "memory writes are denied for this task kind" };
  }

  return { status: "allowed", reason: "execution approved by policy" };
}

export function buildSystemPrompt(options: {
  kind: AgentTaskKind;
  platform: string;
  memoryContext: string;
  soulContext: string;
  skillsContext: string;
  visibleCapabilityNames?: string[];
  model: string;
}): string {
  const { kind, platform, memoryContext, soulContext, skillsContext, visibleCapabilityNames = [], model } = options;

  const sharedSections = [
    "You are SimpleClaw, an autonomous versatile agent.",
    soulContext ? `\n### IDENTITY & PERSONA\n${soulContext}\n` : "",
    "",
    `**Current Platform**: ${platform}`,
    `**Core Model**: ${model}`,
    "",
    "**Behavior**:",
    "1. Keep conversational output minimal.",
    "2. Use tools only when they are actually needed to complete the task.",
    "3. If a task involves real-world data, use the 'browser' tool when available.",
    "4. Do not claim a tool action happened unless you actually used the tool.",
    `5. Approved capabilities for this run: ${visibleCapabilityNames.length > 0 ? visibleCapabilityNames.join(", ") : "none"}.`,
    "6. If you encounter a missing dependency or tool (e.g., 'not found' or 'command not recognized'), you are encouraged to proactively install it using available tools if it is safe and necessary.",
    "7. You have 'Dynamic Setup' enabled: you can fall back to 'npx' execution for supported tools (like opencode-ai) if the local installation is missing.",
  ];

  const modeSections =
    kind === "autonomous"
      ? [
          "",
          "**Autonomous Work Protocol**:",
          "1. Check `.agents/comm/OUTBOX.md` for pending instructions and `.agents/comm/INBOX.md` for recent status before acting when relevant.",
          "2. Continue unfinished work only when it is still actionable.",
          "3. Update `.agents/comm/INBOX.md` only when there is meaningful progress, a blocker, or a durable observation.",
          "4. Prefer no-op when no actionable background work remains.",
        ]
      : [
          "",
          "**Interactive Chat Protocol**:",
          "1. Prefer direct answers for simple conversational prompts.",
          "2. Do not bootstrap or inspect `.agents/comm` files unless the user asks or the task clearly depends on them.",
          "3. Do not write memory for casual conversation unless explicitly asked.",
        ];

  return [...sharedSections, ...modeSections, "", memoryContext, skillsContext].join("\n");
}

export function getVisibleCapabilities(
  capabilities: CapabilityDefinition[],
  context: RuntimeCapabilityContext,
): CapabilityDefinition[] {
  return capabilities.filter((capability) => getCapabilityVisibility(capability, context).visible);
}

export function getCapabilityAuditLog(
  capabilities: CapabilityDefinition[],
  context: RuntimeCapabilityContext,
): string[] {
  return capabilities.map((capability) => {
    const visibility = getCapabilityVisibility(capability, context);
    const execution = canExecuteCapability(capability, context);
    return `${capability.name}: visible=${visibility.visible} (${visibility.reason}); execution=${execution.status} (${execution.reason})`;
  });
}

export function isCodingDelegationPrompt(prompt: string): boolean {
  return /(implement|refactor|write code|fix bug|edit file|coding|delegate)/i.test(prompt);
}

export function shouldAllowDelegationRefinement(previousAttemptCount: number): boolean {
  return previousAttemptCount < 2;
}

export function explainPolicyDecision(capability: string, decision: CapabilityExecutionDecision): string {
  return `${capability}: ${decision.status} (${decision.reason})`;
}

export function getStructuredCapabilityDenial(capability: string, reason: string): string {
  return JSON.stringify({ error: "CAPABILITY_DENIED", capability, reason });
}

export function getStructuredCapabilityDisabled(capability: string, reason: string): string {
  return JSON.stringify({ error: "CAPABILITY_DISABLED", capability, reason });
}

export function getStructuredCapabilityUnknown(capability: string): string {
  return JSON.stringify({ error: "CAPABILITY_UNKNOWN", capability });
}

export function getPolicySummary(context: RuntimeCapabilityContext): string {
  return `taskKind=${context.taskKind}; mode=${context.mode}; source=${context.source ?? "unknown"}`;
}
