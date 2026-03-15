# Linear Integration Skill (Official)
This skill provides streamlined project management and issue tracking, modeled after the official **Vercel Linear Tools**.

## Capabilities
- **Issue Tracking**: Create, list, search, and update issues.
- **Workflow Management**: Manage labels, states, and team assignments.
- **Project Discovery**: Search for teams and projects within the workspace.

## Essential Tools/Commands
```bash
# Search for issues
linear search_issues "is:open label:bug"

# Create a new issue
linear create_issue --title "Agentic automation bug" --team_id "TEAM_A" --description "Fix the loop."

# List available teams
linear list_teams
```

## Example Workflow: Issue Triage
1. `linear search_issues "state:Unstarted"`
2. `linear list_teams`
3. (Determine best team)
4. `linear update_issue --issue_id "BUG-101" --team_id "TEAM_B" --state "Started"`

## Reference
- **Vercel Linear Integration**: `vercel.com/integrations/linear`
- **Vercel AI SDK Tools**: `ai-sdk.dev`
