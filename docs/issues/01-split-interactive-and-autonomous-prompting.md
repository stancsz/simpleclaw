# Split interactive and autonomous prompting

Note for AI: This is a local GitHub issue draft because `gh issue create` failed with `HTTP 401: Requires authentication`. Once GitHub CLI auth is available, create the matching remote issue and replace this note with the issue link.

## Summary
Refactor the agent prompting model so interactive CLI/user prompts use a conversational-first prompt profile, while heartbeat/background/delegated tasks use a distinct autonomy-oriented prompt profile.

## Problem
`src/core/agent.ts` currently mixes conversational and autonomy-heavy instructions in one shared system prompt. This causes normal user prompts to overuse tools and behave like background workers.

## Scope
- Update `src/core/agent.ts`
- Add or use task-context-aware prompt selection
- Ensure heartbeat/background work still receives autonomy instructions
- Ensure normal user chat does not

## Acceptance criteria
- Interactive user prompts no longer receive the full autonomy/bootstrap instruction set by default.
- Heartbeat/background/delegated tasks use a distinct autonomy-oriented prompt profile.
- Prompt profile selection is driven by task context/source/mode in code, not string matching on user input.
- A simple CLI prompt like `hello` responds directly without unnecessary tool usage in the common case.
- Heartbeat or autonomous tasks still retain access to unfinished-work/comm-file instructions where intended.
- `src/core/agent.ts` is no longer the single place holding one monolithic prompt for every task type.

## Notes
- This should align with the dispatcher/runtime model already introduced.
- Prefer small explicit prompt builders over one giant template string.
