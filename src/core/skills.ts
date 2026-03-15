import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function loadSkillsContext(): Promise<string> {
  const skillsDir = join(__dirname, "../../.agents/skills");
  let fullContext = "\n\n### AGENT SKILLS\n";

  try {
    // Read top-level .md files
    const files = await readdir(skillsDir, { withFileTypes: true });
    
    for (const file of files) {
      if (file.isFile() && file.name.endsWith(".md") && file.name !== "README.md") {
        const content = await readFile(join(skillsDir, file.name), "utf-8");
        fullContext += `\n--- SKILL: ${file.name} ---\n${content}\n`;
      } else if (file.isDirectory()) {
        // Check for SKILL.md in subdirectories
        const skillPath = join(skillsDir, file.name, "SKILL.md");
        try {
          const content = await readFile(skillPath, "utf-8");
          fullContext += `\n--- SKILL: ${file.name} ---\n${content}\n`;
        } catch (error) {
          // SKILL.md not found in this directory, skip
          continue;
        }
      }
    }
  } catch (error) {
    console.warn("No skills directory found or error reading skills.");
  }

  return fullContext;
}
