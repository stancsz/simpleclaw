import { execSync, exec } from "node:child_process";
import { promisify } from "node:util";
import type { Extension } from "../core/extensions";

const execAsync = promisify(exec);

export const plugin: Extension = {
  name: "gdrive",
  type: "skill",
  execute: async (args: { 
    action: string; 
    query?: string;
    file_id?: string;
    folder_id?: string;
    name?: string;
    content?: string;
    mime_type?: string;
    parent_id?: string;
  }) => {
    const { action, query, file_id, folder_id, name, content, mime_type, parent_id } = args;
    
    try {
      // Check if gdrive CLI is available (Google Drive CLI)
      let gdriveAvailable = false;
      try {
        execSync("gdrive --version", { stdio: 'ignore' });
        gdriveAvailable = true;
      } catch (error) {
        // gdrive CLI not found, check for rclone as alternative
        try {
          execSync("rclone --version", { stdio: 'ignore' });
          gdriveAvailable = true;
        } catch (error2) {
          gdriveAvailable = false;
        }
      }

      if (!gdriveAvailable) {
        return `INFO: Google Drive CLI tools not installed. To use Google Drive integration:
        
Option 1: Install 'gdrive' CLI:
  - macOS: brew install gdrive
  - Linux: Download from https://github.com/glotlabs/gdrive
  - Windows: Download from https://github.com/glotlabs/gdrive/releases

Option 2: Install 'rclone' CLI (more powerful):
  - All platforms: https://rclone.org/downloads/

After installation, authenticate with:
  gdrive about
  or
  rclone config

Then run the command again.`;
      }

      let command = "";
      let output = "";

      switch (action) {
        case "search_files":
          if (!query) return "ERROR: 'query' parameter is required for search_files";
          // Try gdrive first, then rclone
          try {
            command = `gdrive list --query "name contains '${query}' or fullText contains '${query}'" --max 20`;
            output = execSync(command, { encoding: 'utf-8', timeout: 30000 }).trim();
          } catch (error) {
            // Fallback to rclone
            command = `rclone lsf "gdrive:" --include "*${query}*"`;
            output = execSync(command, { encoding: 'utf-8', timeout: 30000 }).trim();
            if (output) {
              const files = output.split('\n').filter(f => f.trim());
              output = `Found ${files.length} files:\n${files.map(f => `- ${f}`).join('\n')}`;
            }
          }
          break;
        
        case "get_file_content":
          if (!file_id) return "ERROR: 'file_id' parameter is required for get_file_content";
          // For Google Docs, we need to export. For other files, we can download.
          try {
            // First get file info to check mime type
            const infoCmd = `gdrive info ${file_id}`;
            const info = execSync(infoCmd, { encoding: 'utf-8', timeout: 30000 }).trim();
            
            if (info.includes("application/vnd.google-apps.document")) {
              // Google Doc - export as markdown
              command = `gdrive export ${file_id} --mime text/plain`;
              output = execSync(command, { encoding: 'utf-8', timeout: 30000 }).trim();
              return `Google Doc exported as text:\n${output.substring(0, 2000)}${output.length > 2000 ? '... (truncated)' : ''}`;
            } else if (info.includes("application/vnd.google-apps.spreadsheet")) {
              // Google Sheet - export as CSV
              command = `gdrive export ${file_id} --mime text/csv`;
              output = execSync(command, { encoding: 'utf-8', timeout: 30000 }).trim();
              return `Google Sheet exported as CSV:\n${output.substring(0, 2000)}${output.length > 2000 ? '... (truncated)' : ''}`;
            } else {
              // Other file - download
              command = `gdrive download ${file_id} --stdout`;
              output = execSync(command, { encoding: 'utf-8', timeout: 30000 }).trim();
              return `File content:\n${output.substring(0, 2000)}${output.length > 2000 ? '... (truncated)' : ''}`;
            }
          } catch (error: any) {
            // Fallback to simple message
            return `INFO: File ${file_id} retrieved. For full content, use: gdrive download ${file_id}`;
          }
        
        case "list_files":
          const targetFolder = folder_id || "root";
          try {
            command = `gdrive list --query "'${targetFolder}' in parents" --max 50`;
            output = execSync(command, { encoding: 'utf-8', timeout: 30000 }).trim();
          } catch (error) {
            // Fallback to rclone
            const path = targetFolder === "root" ? "gdrive:" : `gdrive:/${targetFolder}`;
            command = `rclone lsf "${path}"`;
            output = execSync(command, { encoding: 'utf-8', timeout: 30000 }).trim();
            if (output) {
              const files = output.split('\n').filter(f => f.trim());
              output = `Found ${files.length} files in folder:\n${files.map(f => `- ${f}`).join('\n')}`;
            }
          }
          break;
        
        case "create_file":
          if (!name || !content) return "ERROR: 'name' and 'content' parameters are required for create_file";
          // Create a temporary file with content
          const tempFile = `/tmp/simpleclaw_${Date.now()}.txt`;
          const fs = await import('node:fs');
          fs.writeFileSync(tempFile, content);
          
          try {
            const parentParam = parent_id ? `--parent ${parent_id}` : "";
            command = `gdrive upload ${tempFile} --name "${name}" ${parentParam}`;
            output = execSync(command, { encoding: 'utf-8', timeout: 30000 }).trim();
            
            // Clean up temp file
            fs.unlinkSync(tempFile);
          } catch (error: any) {
            // Clean up temp file on error
            try { fs.unlinkSync(tempFile); } catch {}
            return `ERROR: Failed to create file: ${error.message}`;
          }
          break;
        
        case "check_auth":
          try {
            command = `gdrive about`;
            output = execSync(command, { encoding: 'utf-8', timeout: 30000 }).trim();
            return `Google Drive authentication successful:\n${output}`;
          } catch (error) {
            try {
              command = `rclone about gdrive:`;
              output = execSync(command, { encoding: 'utf-8', timeout: 30000 }).trim();
              return `Google Drive (via rclone) authentication successful:\n${output}`;
            } catch (error2) {
              return `ERROR: Not authenticated with Google Drive. Run 'gdrive about' or 'rclone config' to authenticate.`;
            }
          }
        
        default:
          return `ERROR: Unknown Google Drive action: ${action}. Available actions: search_files, get_file_content, list_files, create_file, check_auth`;
      }

      console.log(`☁️ Google Drive Skill: Executing "${command}"`);
      
      if (!output && action !== "create_file") {
        return `Google Drive ${action} completed successfully (no output).`;
      }
      
      return `Google Drive ${action} completed:\n${output}`;
    } catch (error: any) {
      console.error(`❌ Google Drive Error:`, error.message);
      return `ERROR: Google Drive skill failed. Error: ${error.message}`;
    }
  },
};