import { execSync, exec } from "node:child_process";
import { promisify } from "node:util";
import type { Extension } from "../core/extensions";

const execAsync = promisify(exec);

export const plugin: Extension = {
  name: "github",
  type: "skill",
  execute: async (args: { 
    action: string; 
    owner?: string;
    repo?: string;
    path?: string;
    title?: string;
    body?: string;
    head?: string;
    base?: string;
    pull_number?: string;
    issue_number?: string;
    query?: string;
    content?: string;
    branch?: string;
    state?: string;
    labels?: string;
  }) => {
    const { action, owner, repo, path, title, body, head, base, pull_number, issue_number, query, content, branch, state, labels } = args;
    
    try {
      // Check if GitHub CLI is installed
      try {
        execSync("gh --version", { stdio: 'ignore' });
      } catch (error) {
        return "ERROR: GitHub CLI (gh) is not installed. Please install it from https://cli.github.com/";
      }

      let command = "gh";
      let output = "";

      switch (action) {
        case "search_repos":
          if (!query) return "ERROR: 'query' parameter is required for search_repos";
          command += ` search repos "${query}" --json=name,fullName,description,updatedAt,stargazerCount`;
          break;
        
        case "search_issues":
          if (!query) return "ERROR: 'query' parameter is required for search_issues";
          command += ` search issues "${query}" --json=title,number,state,repository,updatedAt`;
          break;
        
        case "search_code":
          if (!query) return "ERROR: 'query' parameter is required for search_code";
          command += ` search code "${query}" --json=name,path,repository,textMatches`;
          break;
        
        case "get_file_contents":
          if (!owner || !repo || !path) return "ERROR: 'owner', 'repo', and 'path' parameters are required for get_file_contents";
          command += ` api /repos/${owner}/${repo}/contents/${path}`;
          break;
        
        case "create_file":
          if (!owner || !repo || !path || !content || !branch) return "ERROR: 'owner', 'repo', 'path', 'content', and 'branch' parameters are required for create_file";
          const createPayload = JSON.stringify({
            message: `Create ${path}`,
            content: Buffer.from(content).toString('base64'),
            branch: branch
          });
          command += ` api --method PUT /repos/${owner}/${repo}/contents/${path} --input - << 'EOF'\n${createPayload}\nEOF`;
          break;
        
        case "list_pull_requests":
          if (!owner || !repo) return "ERROR: 'owner' and 'repo' parameters are required for list_pull_requests";
          command += ` pr list --repo ${owner}/${repo} --json=number,title,state,author,createdAt`;
          break;
        
        case "get_pull_request":
          if (!owner || !repo || !pull_number) return "ERROR: 'owner', 'repo', and 'pull_number' parameters are required for get_pull_request";
          command += ` pr view ${pull_number} --repo ${owner}/${repo} --json=number,title,state,body,headRefName,baseRefName,additions,deletions`;
          break;
        
        case "create_pull_request":
          if (!owner || !repo || !title || !head || !base) return "ERROR: 'owner', 'repo', 'title', 'head', and 'base' parameters are required for create_pull_request";
          command += ` pr create --repo ${owner}/${repo} --title "${title}" --head ${head} --base ${base}`;
          if (body) command += ` --body "${body}"`;
          break;
        
        case "list_issues":
          if (!owner || !repo) return "ERROR: 'owner' and 'repo' parameters are required for list_issues";
          command += ` issue list --repo ${owner}/${repo} --json=number,title,state,author,createdAt`;
          break;
        
        case "create_issue":
          if (!owner || !repo || !title) return "ERROR: 'owner', 'repo', and 'title' parameters are required for create_issue";
          command += ` issue create --repo ${owner}/${repo} --title "${title}"`;
          if (body) command += ` --body "${body}"`;
          if (labels) command += ` --label "${labels}"`;
          break;
        
        case "get_repo_info":
          if (!owner || !repo) return "ERROR: 'owner' and 'repo' parameters are required for get_repo_info";
          command += ` repo view ${owner}/${repo} --json=name,description,homepage,language,stargazerCount,forkCount,updatedAt`;
          break;
        
        case "clone_repo":
          if (!owner || !repo) return "ERROR: 'owner' and 'repo' parameters are required for clone_repo";
          command = `git clone https://github.com/${owner}/${repo}.git`;
          break;
        
        case "check_auth":
          command += ` auth status`;
          break;
        
        default:
          return `ERROR: Unknown GitHub action: ${action}. Available actions: search_repos, search_issues, search_code, get_file_contents, create_file, list_pull_requests, get_pull_request, create_pull_request, list_issues, create_issue, get_repo_info, clone_repo, check_auth`;
      }

      console.log(`🐙 GitHub Skill: Executing "${command}"`);
      
      try {
        if (command.includes("<< 'EOF'")) {
          // Handle heredoc commands
          const { stdout, stderr } = await execAsync(command, { shell: 'bash' });
          output = stdout.trim();
          if (stderr) console.error(`GitHub stderr: ${stderr}`);
        } else {
          output = execSync(command, { 
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
            timeout: 30000
          }).trim();
        }

        // Try to parse JSON output for better formatting
        try {
          const jsonOutput = JSON.parse(output);
          if (Array.isArray(jsonOutput)) {
            return `GitHub ${action} completed. Found ${jsonOutput.length} items:\n${JSON.stringify(jsonOutput, null, 2)}`;
          } else {
            return `GitHub ${action} completed:\n${JSON.stringify(jsonOutput, null, 2)}`;
          }
        } catch {
          // Not JSON, return as-is
          if (!output) {
            return `GitHub ${action} completed successfully (no output).`;
          }
          return `GitHub ${action} completed:\n${output}`;
        }
      } catch (error: any) {
        const stderr = error.stderr?.toString() || "";
        const stdout = error.stdout?.toString() || "";
        console.error(`❌ GitHub command failed:`, error.message, stderr);
        
        // Provide helpful error messages
        if (stderr.includes("authentication")) {
          return `ERROR: GitHub authentication required. Run 'gh auth login' first.\n${stderr}`;
        } else if (stderr.includes("not found")) {
          return `ERROR: Repository or resource not found.\n${stderr}`;
        } else if (stderr.includes("rate limit")) {
          return `ERROR: GitHub API rate limit exceeded. Try again later.\n${stderr}`;
        }
        
        return `ERROR: GitHub command failed.\nStdout: ${stdout}\nStderr: ${stderr}\nError: ${error.message}`;
      }
    } catch (error: any) {
      console.error(`❌ GitHub Error:`, error.message);
      return `ERROR: GitHub skill failed. Error: ${error.message}`;
    }
  },
};