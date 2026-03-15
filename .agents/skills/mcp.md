# Model Context Protocol (MCP) Skill
This skill identifies SimpleClaw's ability to interface with any **official MCP server** as defined by Anthropic, providing a standardized way to connect with external tools and data.

## Capabilities
- **Universal Tooling**: Connect to any MCP-compliant server (Slack, Postgres, Brave Search, etc.).
- **Standardized Schema**: Uses the standardized MCP protocol for tool definition and invocation.
- **Context Management**: Seamlessly injects external data into the agent's reasoning context.

## Common MCP Servers
- **Slack**: Channel history, thread replies, user profiles.
- **Postgres**: Standardized database queries and schema inspection.
- **Brave Search**: Web searching and content retrieval.
- **Puppeteer**: Browser automation and snapshotting.
- **Filesystem**: Safe, structured access to local file systems.

## Usage
MCP servers are typically configured in the `simpleclaw.config.json` or through environment variables.

```bash
# Example usage of an MCP tool (standardized)
mcp call slack post_message --channel "C123" --text "Hello from SimpleClaw!"
mcp call postgres execute_query --query "SELECT * FROM users LIMIT 10"
```

## Reference
- **Model Context Protocol**: `modelcontextprotocol.io`
- **Awesome MCP Servers**: `github.com/punkpeye/awesome-mcp-servers`
