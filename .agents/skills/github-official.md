# GitHub Integration Skill (Official)
This skill provides comprehensive GitHub repository and workflow management, modeled after the official **Vercel GitHub Tools** and **Anthropic MCP GitHub Server**.

## Capabilities
- **Repository Management**: Create, list, and get metadata for repositories and branches.
- **File Operations**: Read contents, create/update files (with commits), and push multiple files.
- **Pull Requests**: Create, list, merge, and retrieve diffs or add comments.
- **Issues**: Create, list, close, and search issues or add comments.
- **Search**: Robust searching for code, repositories, and users.

## Essential Tools/Commands
(Assuming integration via `agent-browser` or internal GitHub plugin)

```bash
# Search for issues
github search search_issues "is:open label:bug"

# Create a pull request
github pull_requests create_pull_request --title "Fix: bug" --head "fix-branch" --base "main"

# Read file content
github repository get_file_contents --owner "owner" --repo "repo" --path "src/index.ts"
```

## Example Workflow: Automated PR Review
1. `github pull_requests list_pull_requests --owner "simpleclaw" --repo "core"`
2. `github pull_requests get_pull_request --owner "simpleclaw" --repo "core" --pull_number 123`
3. `github repository get_pull_request_diff --owner "simpleclaw" --repo "core" --pull_number 123`
4. (Analyze diff)
5. `github pull_requests create_pull_request_review_comment --owner "simpleclaw" --repo "core" --pull_number 123 --body "Looks good, but check the naming."`

## Reference
- **Vercel GitHub Tools**: `vercel-labs/github-tools`
- **Anthropic MCP GitHub**: `modelcontextprotocol/servers/github`
