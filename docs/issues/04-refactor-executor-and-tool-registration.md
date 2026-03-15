# Refactor executor and tool registration

Note for AI: This is a local GitHub issue draft because `gh issue create` failed with `HTTP 401: Requires authentication`. Once GitHub CLI auth is available, create the matching remote issue and replace this note with the issue link.

## Summary
Clean up legacy fallback behavior in `src/core/executor.ts` and move toward a single runtime-owned view of available tools/capabilities.

## Problem
Tool execution still relies on broad fallback paths and legacy assumptions. This conflicts with the newer dispatcher/runtime architecture and makes behavior harder to reason about.

## Scope
- Refactor `src/core/executor.ts`
- Reduce or isolate legacy bridge behavior
- Unify tool exposure and registration ownership
- Ensure agent/runtime can enumerate allowed tools cleanly

## Acceptance criteria
- `src/core/executor.ts` no longer serves as a vague legacy fallback path for unrelated tool behavior.
- Tool exposure is derived from a runtime-owned source of truth rather than duplicated assumptions across transports.
- Duplicate tool schema/orchestration logic is reduced or eliminated where possible.
- Legacy bridge behavior is either removed or isolated behind an explicit compatibility path.
- Unknown tools fail in a predictable, intentional way instead of silently falling through broad fallback behavior.
- Runtime/agent code can enumerate the allowed tool set without requiring transport-local copies.
- Existing working tool paths used by the agent loop still function after the refactor.

## Notes
- Keep compatibility where necessary, but make it explicit.
- This issue should improve clarity more than add new features.
