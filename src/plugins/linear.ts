import { execSync, exec } from "node:child_process";
import { promisify } from "node:util";
import type { Extension } from "../core/extensions";

const execAsync = promisify(exec);

export const plugin: Extension = {
  name: "linear",
  type: "skill",
  execute: async (args: { 
    action: string; 
    query?: string;
    issue_id?: string;
    title?: string;
    description?: string;
    team_id?: string;
    state?: string;
    label?: string;
    assignee_id?: string;
    project_id?: string;
  }) => {
    const { action, query, issue_id, title, description, team_id, state, label, assignee_id, project_id } = args;
    
    try {
      // Check if Linear CLI is available or if we have API key
      const linearApiKey = process.env.LINEAR_API_KEY;
      let linearAvailable = false;
      
      if (linearApiKey) {
        linearAvailable = true;
      } else {
        try {
          execSync("linear --version", { stdio: 'ignore' });
          linearAvailable = true;
        } catch (error) {
          linearAvailable = false;
        }
      }

      if (!linearAvailable) {
        return `INFO: Linear integration requires setup. 

Option 1: Set LINEAR_API_KEY environment variable:
  - Get API key from https://linear.app/settings/api
  - Add to .env: LINEAR_API_KEY=lin_api_...

Option 2: Install Linear CLI:
  - npm install -g @linear/cli
  - Then run: linear login

After setup, run the command again.`;
      }

      let command = "";
      let output = "";
      const headers = linearApiKey ? `-H "Authorization: ${linearApiKey}" -H "Content-Type: application/json"` : "";

      switch (action) {
        case "search_issues":
          if (!query) return "ERROR: 'query' parameter is required for search_issues";
          
          if (linearApiKey) {
            // Use Linear API directly
            const graphqlQuery = JSON.stringify({
              query: `
                query {
                  issues(filter: { 
                    search: "${query}"
                    state: { name: { nin: ["Canceled", "Completed"] } }
                  }) {
                    nodes {
                      id
                      identifier
                      title
                      state { name }
                      team { name }
                      labels { nodes { name } }
                      createdAt
                    }
                  }
                }
              `
            });
            
            command = `curl -s -X POST https://api.linear.app/graphql ${headers} -d '${graphqlQuery}'`;
            output = execSync(command, { encoding: 'utf-8', timeout: 30000 }).trim();
            
            try {
              const result = JSON.parse(output);
              if (result.data?.issues?.nodes) {
                const issues = result.data.issues.nodes;
                return `Found ${issues.length} issues:\n${issues.map((issue: any) => 
                  `- ${issue.identifier}: ${issue.title} (${issue.state.name}, ${issue.team.name})`
                ).join('\n')}`;
              }
            } catch (e) {
              // Return raw output if parsing fails
            }
          } else {
            // Use Linear CLI
            command = `linear issues list --search "${query}" --json`;
            output = execSync(command, { encoding: 'utf-8', timeout: 30000 }).trim();
          }
          break;
        
        case "create_issue":
          if (!title || !team_id) return "ERROR: 'title' and 'team_id' parameters are required for create_issue";
          
          if (linearApiKey) {
            const createMutation = JSON.stringify({
              query: `
                mutation {
                  issueCreate(input: {
                    title: "${title}"
                    description: "${description || ''}"
                    teamId: "${team_id}"
                    ${state ? `stateId: "${state}"` : ''}
                    ${assignee_id ? `assigneeId: "${assignee_id}"` : ''}
                    ${project_id ? `projectId: "${project_id}"` : ''}
                  }) {
                    success
                    issue {
                      id
                      identifier
                      title
                      url
                    }
                  }
                }
              `
            });
            
            command = `curl -s -X POST https://api.linear.app/graphql ${headers} -d '${createMutation}'`;
            output = execSync(command, { encoding: 'utf-8', timeout: 30000 }).trim();
          } else {
            command = `linear issues create --title "${title}" --team "${team_id}"`;
            if (description) command += ` --description "${description}"`;
            if (state) command += ` --state "${state}"`;
            output = execSync(command, { encoding: 'utf-8', timeout: 30000 }).trim();
          }
          break;
        
        case "list_teams":
          if (linearApiKey) {
            const teamsQuery = JSON.stringify({
              query: `
                query {
                  teams {
                    nodes {
                      id
                      name
                      key
                      description
                    }
                  }
                }
              `
            });
            
            command = `curl -s -X POST https://api.linear.app/graphql ${headers} -d '${teamsQuery}'`;
            output = execSync(command, { encoding: 'utf-8', timeout: 30000 }).trim();
            
            try {
              const result = JSON.parse(output);
              if (result.data?.teams?.nodes) {
                const teams = result.data.teams.nodes;
                return `Available teams:\n${teams.map((team: any) => 
                  `- ${team.name} (${team.key}): ${team.description || 'No description'}`
                ).join('\n')}`;
              }
            } catch (e) {
              // Return raw output if parsing fails
            }
          } else {
            command = `linear teams list --json`;
            output = execSync(command, { encoding: 'utf-8', timeout: 30000 }).trim();
          }
          break;
        
        case "get_issue":
          if (!issue_id) return "ERROR: 'issue_id' parameter is required for get_issue";
          
          if (linearApiKey) {
            const issueQuery = JSON.stringify({
              query: `
                query {
                  issue(id: "${issue_id}") {
                    id
                    identifier
                    title
                    description
                    state { name }
                    team { name }
                    labels { nodes { name } }
                    assignee { name }
                    createdAt
                    updatedAt
                  }
                }
              `
            });
            
            command = `curl -s -X POST https://api.linear.app/graphql ${headers} -d '${issueQuery}'`;
            output = execSync(command, { encoding: 'utf-8', timeout: 30000 }).trim();
          } else {
            command = `linear issues view ${issue_id} --json`;
            output = execSync(command, { encoding: 'utf-8', timeout: 30000 }).trim();
          }
          break;
        
        case "update_issue":
          if (!issue_id) return "ERROR: 'issue_id' parameter is required for update_issue";
          
          if (linearApiKey) {
            let updateInput = [];
            if (title) updateInput.push(`title: "${title}"`);
            if (description) updateInput.push(`description: "${description}"`);
            if (state) updateInput.push(`stateId: "${state}"`);
            if (assignee_id) updateInput.push(`assigneeId: "${assignee_id}"`);
            if (label) updateInput.push(`labelIds: ["${label}"]`);
            
            if (updateInput.length === 0) {
              return "ERROR: No update parameters provided";
            }
            
            const updateMutation = JSON.stringify({
              query: `
                mutation {
                  issueUpdate(id: "${issue_id}", input: {
                    ${updateInput.join('\n')}
                  }) {
                    success
                    issue {
                      id
                      identifier
                      title
                    }
                  }
                }
              `
            });
            
            command = `curl -s -X POST https://api.linear.app/graphql ${headers} -d '${updateMutation}'`;
            output = execSync(command, { encoding: 'utf-8', timeout: 30000 }).trim();
          } else {
            command = `linear issues update ${issue_id}`;
            if (title) command += ` --title "${title}"`;
            if (description) command += ` --description "${description}"`;
            if (state) command += ` --state "${state}"`;
            output = execSync(command, { encoding: 'utf-8', timeout: 30000 }).trim();
          }
          break;
        
        case "check_auth":
          if (linearApiKey) {
            // Test API key with a simple query
            const testQuery = JSON.stringify({
              query: `query { viewer { id name email } }`
            });
            
            command = `curl -s -X POST https://api.linear.app/graphql ${headers} -d '${testQuery}'`;
            output = execSync(command, { encoding: 'utf-8', timeout: 30000 }).trim();
            
            try {
              const result = JSON.parse(output);
              if (result.data?.viewer) {
                return `Linear authentication successful. Logged in as: ${result.data.viewer.name} (${result.data.viewer.email})`;
              } else if (result.errors) {
                return `Linear authentication failed: ${result.errors[0]?.message}`;
              }
            } catch (e) {
              return `Linear authentication check completed.`;
            }
          } else {
            command = `linear whoami`;
            output = execSync(command, { encoding: 'utf-8', timeout: 30000 }).trim();
          }
          break;
        
        default:
          return `ERROR: Unknown Linear action: ${action}. Available actions: search_issues, create_issue, list_teams, get_issue, update_issue, check_auth`;
      }

      console.log(`📋 Linear Skill: Executing "${command}"`);
      
      if (!output) {
        return `Linear ${action} completed successfully (no output).`;
      }
      
      // Try to parse JSON output for better formatting
      try {
        const jsonOutput = JSON.parse(output);
        return `Linear ${action} completed:\n${JSON.stringify(jsonOutput, null, 2)}`;
      } catch {
        return `Linear ${action} completed:\n${output}`;
      }
    } catch (error: any) {
      console.error(`❌ Linear Error:`, error.message);
      return `ERROR: Linear skill failed. Error: ${error.message}`;
    }
  },
};