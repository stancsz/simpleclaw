# Introduce core policy module

Note for AI: This is a local GitHub issue draft because `gh issue create` failed with `HTTP 401: Requires authentication`. Once GitHub CLI auth is available, create the matching remote issue and replace this note with the issue link.

## Summary
Create `src/core/policy.ts` to centralize runtime decisions that are currently encoded in prompt text, such as direct-reply preference, autonomy enablement, tool restraint, and memory-write eligibility.

## Problem
Behavior that should be deterministic is currently left to prompt wording. This makes the agent harder to control and harder to test.

## Scope
- Add `src/core/policy.ts`
- Move runtime behavior decisions out of prompt text and into policy helpers
- Wire agent/runtime to consult policy

## Acceptance criteria
- A new `src/core/policy.ts` exists and owns runtime decision helpers.
- At minimum, policy covers:
  - when to prefer direct reply vs tool usage
  - when autonomy mode is allowed
  - when memory writes are allowed
  - whether special bootstrap/comm behavior should apply
- `src/core/agent.ts` consults policy instead of embedding all behavior directly in prompt prose.
- Heartbeat/background behavior is explicitly policy-controlled.
- Interactive CLI behavior is explicitly policy-controlled.
- At least one existing behavior currently encoded in prompt text is moved into policy-enforced code.
- Policy functions are testable without needing a live model call.

## Notes
- Keep the initial policy module small and practical.
- This is a prerequisite for making provider/model behavior more predictable later.
