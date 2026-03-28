---
skill_name: opencli
required_credentials: []
---

# OpenCLI Skill

This skill allows the agent to use `@jackwener/opencli` to transform any website, Electron app, or local CLI tool into a command-line interface.

## Execution Logic
When this skill is loaded, the worker should execute the following behavior:

1. Determine the exact `opencli` command required by the task.
2. Use the `action: "run"` parameter and pass the required command as the `command` property string. For example: `command: "hackernews top --limit 5"`.
3. Call the tool to execute the `opencli` command.
4. Parse the output of the CLI tool and return it in a structured format as required by the user prompt.
