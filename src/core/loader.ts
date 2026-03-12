import { readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { extensionRegistry } from "./extensions.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import { pathToFileURL } from "node:url";

export async function loadPlugins() {
  const pluginsDir = join(__dirname, "../plugins");

  try {
    const files = await readdir(pluginsDir);

    for (const file of files) {
      if (file.endsWith(".ts") || file.endsWith(".js")) {
        const pluginBaseName = file.replace(/\.(ts|js)$/, "");
        const envVarName = `ENABLE_${pluginBaseName.toUpperCase()}`;
        
        if (process.env[envVarName] !== "true") {
          console.log(`Skipping plugin ${file} (Disabled via ${envVarName})`);
          continue;
        }

        console.log(`Loading plugin: ${file}`);
        const pluginPath = pathToFileURL(join(pluginsDir, file)).href;
        const module = await import(pluginPath);

        if (module.plugin) {
          extensionRegistry.register(module.plugin);
          console.log(
            `Registered plugin: ${module.plugin.name} (${module.plugin.type})`,
          );
        } else {
          console.warn(`File ${file} does not export a 'plugin' object.`);
        }
      }
    }
  } catch (error) {
    console.error("Error loading plugins:", error);
  }
}
