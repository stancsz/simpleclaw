import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extensionRegistry } from "./extensions.ts";

// Mock legacy bridge for fallback
const legacyBridge = {
  dispatch: (toolName: string, args: any) => {
    return `Legacy fallback for ${toolName} with args: ${JSON.stringify(args)}`;
  },
};

export async function executeNativeTool(toolName: string, args: any) {
  if (/rm -rf|mkfs|dd|sudo/i.test(JSON.stringify(args))) return "DENIED";

  const handlers: any = {
    read: (p: string) => readFileSync(p, "utf-8"),
    shell: (c: string) => execSync(c).toString(),
    git: (m: string) => execSync(`git commit -m "${m}"`).toString(),
  };

  return (
    (await handlers[toolName]?.(args.path || args.cmd || args.msg)) ??
    (await extensionRegistry.execute(toolName, args).catch(() => null)) ??
    legacyBridge.dispatch(toolName, args)
  );
}
