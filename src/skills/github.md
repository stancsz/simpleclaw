---
skill_name: github
required_credentials: ["github_token"]
---

# GitHub Skill

This skill allows the agent to make requests to the GitHub API.

## Execution Logic
When this skill is loaded, the worker should execute the following behavior:

1. Use the injected credential (`github_token`) to authenticate.
2. Formulate the correct API request based on the task description.
3. Call the GitHub API endpoint.
4. Parse the JSON response.
5. Return the parsed JSON object.