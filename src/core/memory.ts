import { readFile, writeFile, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MEMORY_DIR = join(__dirname, "../../.agents/memory");
const MAIN_MEMORY_FILE = join(MEMORY_DIR, "memory.md");

export async function loadLongTermMemory(): Promise<string> {
  try {
    let memoryContent = "\n\n### LONG-TERM MEMORY\n";
    
    // Read the main memory file
    const mainContent = await readFile(MAIN_MEMORY_FILE, "utf-8");
    memoryContent += `\n--- MAIN MEMORY ---\n${mainContent}\n`;
    
    // Read other logs/files in memory dir
    const files = await readdir(MEMORY_DIR);
    for (const file of files) {
      if (file.endsWith(".md") && file !== "memory.md") {
        const content = await readFile(join(MEMORY_DIR, file), "utf-8");
        memoryContent += `\n--- LOG: ${file} ---\n${content}\n`;
      }
    }
    
    return memoryContent;
  } catch (error) {
    console.warn("No memory file found or error reading memory.");
    return "\n\n### LONG-TERM MEMORY\n(Memory is currently empty)\n";
  }
}

export async function updateMemory(newInfo: string): Promise<string> {
  try {
    const timestamp = new Date().toISOString().split('T')[0];
    const entry = `\n- [${timestamp}] ${newInfo}`;
    
    // Append to Knowledge Entries section in memory.md
    const currentMemory = await readFile(MAIN_MEMORY_FILE, "utf-8");
    
    let updatedMemory = currentMemory;
    if (currentMemory.includes("## Knowledge Entries")) {
      updatedMemory = currentMemory.replace("## Knowledge Entries", `## Knowledge Entries${entry}`);
    } else {
      updatedMemory += `\n\n## Knowledge Entries${entry}`;
    }
    
    await writeFile(MAIN_MEMORY_FILE, updatedMemory);
    return `Memory updated successfully with: "${newInfo}"`;
  } catch (error: any) {
    return `Error updating memory: ${error.message}`;
  }
}
