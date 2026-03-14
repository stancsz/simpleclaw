# OpenCode Delegation Skill
Use `delegate_to_opencode` for bounded coding work when the task clearly involves implementing, refactoring, or editing code.

## When to delegate
- The task requires code changes across one or more files.
- The work benefits from a focused coding worker pass before summarizing.
- You can state the objective, scope, constraints, and acceptance criteria clearly.

## How to delegate
Provide structured inputs:
- `objective`: the coding task in one sentence
- `scope`: relevant files or directories
- `constraints`: safety and scope limits
- `acceptanceCriteria`: what must be true when work is done
- `retryBudget`: keep this bounded; one follow-up is the default maximum

## After delegation
- Inspect the returned summary, touched files, and verification notes.
- Summarize the result for the user.
- Only issue one bounded refinement if the first result is partial and the gap is concrete.
- Do not spawn recursive delegates.
