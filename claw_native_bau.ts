import { $ } from "bun";

// Mock legacy bridge for fallback
const legacyBridge = {
  dispatch: (toolName: string, args: any) => {
    return `Legacy fallback for ${toolName} with args: ${JSON.stringify(args)}`;
  }
};

export async function executeNativeTool(toolName: string, args: any) {
  const securityFilter = /rm -rf|mkfs|dd|sudo/i;

  if (securityFilter.test(JSON.stringify(args))) {
    return "DENIED: Security Policy Violation";
  }

  const handlers: Record<string, (arg: any) => Promise<string>> = {
    read: async (p: string) => await Bun.file(p).text(),
    shell: async (c: string) => await $`${c}`.text(),
    git: async (m: string) => await $`git commit -m ${m}`.text(),
  };

  return (handlers[toolName] ? await handlers[toolName](args.path || args.cmd || args.msg) : null)
         || legacyBridge.dispatch(toolName, args);
}
