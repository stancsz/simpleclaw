---
skill_name: agency-agent
required_credentials: []
---

# Agency Agent Skill [EXPERIMENTAL]

This skill enables "External-Agency-Delegation", allowing the worker to dispatch tasks to an external Agency OS sub-agent and retrieve the result.

## Execution Logic

When this skill is loaded, the worker should execute the following behavior:

1. Identify the task that needs to be delegated.
2. Formulate the correct message for the external agent.
3. Call the `agency-agent` capability with the action `delegate_task` and the `message` argument.
4. Process the returned response from the external agent.

### Failure-Mode Analysis & Self-Healing

- If the external agent is unreachable or times out, the `agency-agent` skill will return an error string prefixed with `ERROR:`.
- The worker should catch this error, note the failure, and attempt a secondary path (e.g., self-healing by executing a simpler alternative local skill if available or reporting the failure cleanly to the orchestrator).
