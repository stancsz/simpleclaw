import dotenv from "dotenv";
dotenv.config({ override: true });
import { startRuntime, resolveRuntimeMode, type RuntimeStartOptions } from "./core/runtime.ts";

export async function startClaw(config: RuntimeStartOptions = {}) {
  return await startRuntime(config);
}

if (import.meta.main || process.argv[1]?.endsWith("index.ts")) {
  const mode = resolveRuntimeMode();
  const runtime = await startClaw({ mode });
  runtime.cli?.start(runtime.startupProfile);
}
