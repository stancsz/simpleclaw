# Add dispatcher task handles and cancellation

Note for AI: This is a local GitHub issue draft because `gh issue create` failed with `HTTP 401: Requires authentication`. Once GitHub CLI auth is available, create the matching remote issue and replace this note with the issue link.

## Summary
Extend `src/core/dispatcher.ts` to return stable task handles with consistent lifecycle state, timestamps, parent-child linkage, and cancellation support.

## Problem
The dispatcher can submit work, but task management is still too implicit. Transports and runtime need a first-class way to inspect, manage, and cancel work.

## Scope
- Update `src/core/dispatcher.ts`
- Expose task handles from `submit(...)`
- Normalize task states
- Add cancellation behavior
- Ensure events reflect lifecycle transitions

## Acceptance criteria
- `src/core/dispatcher.ts` returns a stable task handle for submitted work.
- Each handle includes at least:
  - `id`
  - `source`
  - `scope`
  - `status`
  - `startedAt`
  - `parentTaskId` or equivalent optional parent link
  - `cancel()` method
- Dispatcher lifecycle states are normalized to:
  - `queued`
  - `running`
  - `completed`
  - `failed`
  - `cancelled`
- Task lifecycle transitions are emitted consistently through runtime events.
- Per-scope serialization still works after handle introduction.
- Cancelling a queued task prevents execution.
- Cancelling a running task marks it cancelled and surfaces that outcome to subscribers, even if underlying model/tool cancellation is best-effort.
- CLI/runtime code can inspect active tasks without depending on private dispatcher internals.

## Notes
- This is foundational for richer CLI commands like `/tasks` and `/cancel`.
- Don’t over-design persistence yet; in-memory handles are enough for this milestone.
