import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { extensionRegistry } from "./extensions.ts";

// Mock legacy bridge for fallback
const legacyBridge = {
  dispatch: (toolName: string, args: any) => {
    return `Legacy fallback for ${toolName} with args: ${JSON.stringify(args)}`;
  },
};

const stripAnsi = (str: string) => 
  str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');

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
  };

  const result = (
    (await handlers[toolName]?.(args.path || args.cmd || args.msg, args.content)) ??
    (await extensionRegistry.execute(toolName, args).catch(() => null)) ??
    legacyBridge.dispatch(toolName, args)
  );

  return typeof result === "string" ? stripAnsi(result) : result;
}
