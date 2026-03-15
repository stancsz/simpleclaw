# Add runtime integration tests for CLI, dispatcher, heartbeat, and server flows

Note for AI: This is a local GitHub issue draft because `gh issue create` failed with `HTTP 401: Requires authentication`. Once GitHub CLI auth is available, create the matching remote issue and replace this note with the issue link.

## Summary
Add automated tests covering the new runtime foundation so future refactors do not break CLI behavior, dispatcher ordering, heartbeat behavior, or server route exposure.

## Problem
The current runtime refactor spans multiple surfaces but lacks a reliable regression harness.

## Scope
- Add test coverage under a new or existing test directory
- Cover CLI, dispatcher, heartbeat, and server behavior
- Prefer mocked model/provider behavior where possible

## Acceptance criteria
- There is an automated test suite covering Milestone A runtime behavior.
- Tests include at least:
  - default CLI startup
  - CLI multi-turn history retention
  - dispatcher per-scope serialization
  - heartbeat no-op and dedupe behavior
  - explicit server mode startup
  - webhook route exposure behavior
  - security lock enforcement behavior
- Tests do not require manual intervention.
- At least some tests run against mocked model/provider behavior so they are stable and not dependent on external APIs.
- A failing regression in prompt selection, dispatcher lifecycle, or route exposure is detectable by tests.
- Test instructions or scripts are documented in the repo’s normal developer workflow.

## Notes
- Start with integration-style tests around the current runtime, not exhaustive unit tests.
- This issue should make the next milestones much safer.
