# CLAUDE.md - SimpleClaw

## MISSION
SimpleClaw is a **stateless meta-orchestrator**. Its primary mission is to convert natural language intent into a structured execution plan and **delegate the heavy lifting to specialized sub-agents and execution engines (like `opencode`)**.

It dispatches ephemeral Cloud Functions (Workers/Sub-Agents) that receive credentials (KMS-decrypted at runtime), load JIT skills, and execute tasks against the user's own Supabase (the Sovereign Motherboard). SimpleClaw is the "Brain" that coordinates the "Muscle" of sub-agents.

**Source of truth for architecture:** [`SWARM_SPEC.md`](./SWARM_SPEC.md)
**Engineering summary:** [`SPEC.md`](./SPEC.md)

## AGENT WORKSPACE (MODIFIABLE BY AGENT)
- [2026-03-18] Cycle #31 ✅ Integrated Worker Dispatch with Minimal UI's approval flow. Fixed missing module termination quotes for end-to-end testing, connected the dispatcher locally using `bun test`, ensured workers can pull from JIT skills, fetch decrypted credentials and report results.
- [2026-03-18] Cycle #31 ✅ Integrated worker dispatch and execution loop: Modified the Orchestrator Cloud Function to handle `action: 'approve'` and directly call `executeSwarmManifest`, updated the `server/src/app/api/orchestrator/route.ts` API route to await execution properly, adjusted the dashboard UI to route approval requests to the orchestrator correctly, and created a simple `mock-skill` for testing end-to-end connectivity.
- [2026-03-18] Cycle #30 ✅ Implemented end-to-end execution flow: Connected UI approve → dispatcher → worker API → KMS credential → task execution → result logging. Phase 0 swarm orchestrator is now functional.
- [2026-03-17] Cycle #29 ✅ Implemented Phase 1 GitHub worker integration. Created `src/workers/github.worker.ts` with real API call execution using KMS decrypted tokens. Updated `src/core/dispatcher.ts` to dispatch `github` workers. Created `src/skills/github.md` JIT skill document, added example `examples/swarm.example.yaml`, updated `worker.test.ts` with integration testing for the github worker, and updated `orchestrator.ts` to include `github` as an available skill.
- [2026-03-17 05:15] Cycle #28 ✅ Created comprehensive end-to-end integration test validating complete orchestrator → worker → motherboard pipeline. Added `test:integration` script to `package.json`, created test fixture for github issues skill, and added `src/core/integration.test.ts` checking KMS decryption, dispatcher loop, JIT skill loading and idempotency.
- [2026-03-17 03:27] Cycle #27 ✅ Implemented end-to-end swarm integration test: Validated orchestrator → worker dispatch → KMS credential flow → skill execution → result logging. Created `test-api` skill, updated worker template to actually read skills and decrypt credentials from SQLite mock, and added `src/core/integration.test.ts`.
- [2026-03-17 02:42] Cycle #26 ✅ Integrated Worker Dispatch with Minimal UI's approval flow. Created `server/src/app/api/execute/route.ts` API endpoint to handle plan execution using `executeSwarmManifest` and updated `server/src/app/page.tsx` to call this endpoint and reflect the actual execution status.
- [2026-03-16 19:15] Cycle #25 ✅ Implemented Phase 0 Minimal UI: Created `server/src/app/page.tsx` dashboard, `PlanDisplay` and `ExecutionMonitor` components.
- [2026-03-16 18:56] Cycle #24 ✅ Implemented real LLM intent parsing for orchestrator
- [2026-03-16 18:30] Cycle #23 ✅ Implemented Move 3: Worker Dispatch & Execution Loop. Added `executeSwarmManifest` DAG scheduler in `src/core/dispatcher.ts`, created `src/workers/template.ts` with `executeWorkerTask` (idempotency, JIT skill loading, credential fetch, result logging), extended DBClient with `logTaskResult`, and added comprehensive unit tests in `src/workers/worker.test.ts`.
- [2026-03-16 17:58] Cycle #22 ✅ Implemented KMS Credential Flow for Move 6: Created `src/security/kms.ts` wrapper (AES-256-GCM local/GCP selector), `src/security/onboarding.ts` implementation, local `platform_users` table in `src/db/migrations/001_motherboard.sql` + DBClient interactions, and `src/security/kms.test.ts` for comprehensive encryption/decryption validation and Worker lifecycle simulation.
- [2026-03-16] Cycle #21 ✅ Implemented Move 2: Sovereign Motherboard SQL Schema & Local DB via `bun:sqlite` with full table migrations (`001_motherboard.sql`), a `DBClient` wrapper, modified `orchestrator.ts` to checkpoint user sessions, and comprehensive local database tests in `db.test.ts`.
- [2026-03-16] Cycle #20 ✅ Implemented real LLM intent parsing for Move 1. Added OpenAI SDK, configured function calling for `SwarmManifest`, implemented DAG validation in `orchestrator.ts`, and updated `orchestrator.test.ts`.
- [2026-03-16] Cycle #19 ✅ Finished Phase 0 Orchestrator Cloud Function implementation. Created `src/core/types.ts`, refactored `src/core/orchestrator.ts` to output `PlanDiffApprove` schema with multiple DAG steps, created `examples/swarm.example.yaml`, and implemented the `server/src/app/api/orchestrator/route.ts` API wrapper.
- [2026-03-15] Cycle #18 ✅ Started Orchestrator Cloud Function implementation for Phase 0
- [2026-03-15 16:48] Cycle #17 ✅
- [2026-03-15 17:00] Cycle #17 ✅
- [2026-03-15 16:42] Cycle #16 ✅
- [2026-03-15 16:33] Cycle #15 ✅
- [2026-03-15 16:25] Cycle #14 ✅
- [2026-03-15 16:13] Cycle #13 ✅
- [2026-03-15 16:11] Cycle #13 ✅
- [2026-03-15 16:07] Cycle #12 ✅
- [2026-03-15 16:04] Cycle #11 ✅
- [2026-03-15 16:05] Cycle #11 ✅
- [2026-03-15] Cycle #11 ✅ Created PDF processing skill for Phase 2 research capabilities
- [2026-03-15] Cycle #12 ✅ Fixed Windows installation in setup.sh - now properly installs Bun via PowerShell
- [2026-03-15 15:58] Cycle #10 ✅
- [2026-03-15] Cycle #10 ✅ Created finance CSV processing skill for Phase 2 skill expansion
- [2026-03-15 15:54] Cycle #9 ✅
- [2026-03-15 15:55] Cycle #9 ✅
- [2026-03-15] Cycle #9 ✅ Cleaned up duplicate skill files to prevent agent context duplication
- [2026-03-15 15:49] Cycle #8 ✅
- [2026-03-15] Cycle #8 ✅ Fixed duplicate test and improved screencap test imports
- [2026-03-15 15:43] Cycle #7 ✅
- [2026-03-15] Cycle #7 ✅ Created proper screencap skill with full integration
- [2026-03-15 15:36] Cycle #6 ✅
- [2026-03-15 15:28] Cycle #5 ✅
- [2026-03-15 15:24] Cycle #4 ✅
- [2026-03-15 15:30] Cycle #4 ✅ Fixed critical Electron bug: app now properly starts Next.js production server
- [2026-03-15 15:18] Cycle #3 ✅
- [2026-03-15 15:13] Cycle #2 ✅
- [2026-03-15 15:12] Cycle #1 ✅
- [2026-03-15] Cycle #5 ✅ Added write and shell execution capabilities to agent runtime
- [2026-03-15] Cycle #15 ✅ Added comprehensive tests for official skill plugins (GitHub, Google Drive, Linear)
- [2026-03-15] Cycle #16 ✅ Created dedicated plugin test runner with utilities and documentation
- [2026-03-15] Cycle #17 ✅ Fixed cross-platform compatibility in plugin test runner - now works seamlessly on Windows Git Bash

## CURRENT TASK
**Mission pivot: SimpleClaw is now a swarm orchestrator (see SWARM_SPEC.md)**

- Architecture defined in `SWARM_SPEC.md` (updated v1.1 — KMS auth model documented)
- `SPEC.md` rewritten to reflect swarm orchestrator mission
- Core work: Build the Orchestrator Cloud Function, Worker dispatch layer, KMS credential encryption flow, and Sovereign Motherboard SQL schema

## BACKLOG (Swarm Architecture)
- [x] **Move 1:** Real LLM Intent Parsing
- [x] **Phase 0 — Orchestrator CF:** Single Cloud Function: text prompt → `swarm.yaml` manifest
- [x] **Phase 0 — Worker Template:** Ephemeral CF that boots, loads JIT skill, fetches KMS-decrypted credential, executes, terminates
- [x] **Phase 0 — Motherboard Schema:** Apply `SWARM_SPEC.md §9.2` SQL schema to a managed Supabase project / local SQLite equivalent
- [x] **Phase 0 — Worker Dispatch + Execution Loop:** Shift priority here for Move 3. Phase 0 core functionality is now validated and ready for Phase 1 features.
- [x] **Phase 0 — KMS Flow:** GCP Cloud KMS key ring setup + encrypt/decrypt service for Supabase `service_role` keys
- [x] **Phase 0 — Minimal UI:** Text input → plan display → approve button (Next.js dashboard in `server/`)
- [x] **Phase 1 — Real GitHub Worker Integration:** End-to-end validation with KMS-decrypted credentials and actual API calls.
- [ ] **Phase 1 — BYOK UI:** Key management screen storing keys in Supabase Vault
- [ ] **Phase 1 — Gas Tank:** Stripe integration + `gas_ledger` debit after execution
- [ ] **Phase 2 — Heartbeat:** Continuous Mode via `pg_cron` + 30-minute recursive heartbeat

## DISCOVERY LOG
- The project is currently Bun-centric for the core engine.
- Existing `SPEC.md` was empty; now contains the high-level roadmap targeting AutoClaw equivalence.
- **Infrastructure Fix:** Identified that the agent container was missing Python dependencies (`litellm`) and diagnostic tools (`lsof`) required for the DeepSeek proxy. Fixed via `Dockerfile` update and live container repair.
- **Official Skills:** Added foundational skills (GitHub/MCP/Linear) research from Vercel/Anthropic.
- **Privacy Enforcement:** Identified that `.agents/memory/memory.md` was being tracked by git; moved to `.gitignore` to protect agent context.
- **Unified Installer:** Created cross-platform setup.sh that handles macOS, Linux, and Windows (Git Bash/WSL). Features platform detection, Bun installation, dependency management, and clear next-step instructions.
- **Desktop Wrapper:** Created Electron-based desktop shell that integrates with existing Next.js dashboard. Includes secure IPC, process management, and cross-platform packaging.
- **Electron Fix:** Fixed critical bug where Electron app tried to load non-existent `server/out/index.html` instead of starting Next.js production server on port 3001. Added automatic build detection and proper server startup sequence.
- **Plugin Integration Fix:** Discovered that only browser plugin was being exposed as capability. Fixed `buildCapabilityDefinitions` in `runtime.ts` to automatically include all registered skill plugins (screencap, browser, etc.) as capabilities.
- **Enhanced Filesystem Access:** Added `write` and `shell` native capabilities to the agent, enabling file writing and command execution. This completes Phase 2 goal of "Local File/OS Tooling" from SPEC.md.
- **Visual Context Enhancement:** Enhanced screen capture plugin with proper display listing using `screenshot-desktop` library's `listDisplays()` function. Added support for capturing all displays simultaneously and improved error handling. This advances Phase 2 "Visual Context Processing" goal.
- **Skill System Fix:** Discovered that the skill loading system only read top-level `.md` files, missing `SKILL.md` files in subdirectories. Updated `loadSkillsContext()` to recursively load skills from subdirectories, enabling proper screencap skill integration.
- **PDF Research Skill:** Created comprehensive PDF processing skill for document analysis, text extraction, and research workflows. Includes tools for pdftotext, pdfinfo, qpdf, ocrmypdf, and common research patterns.
- **Windows Installation Fix:** Fixed critical issue where setup.sh would exit early on Windows instead of attempting Bun installation. Now uses PowerShell installation method (`irm bun.sh/install.ps1 | iex`) and provides better error handling and PATH management for Windows users.
- **Windows PATH Detection Enhancement:** Improved Bun detection on Windows by checking multiple path formats (`$HOME/.bun/bin`, `$USERPROFILE/.bun/bin`, etc.) and providing clearer instructions when Bun is installed but not in current session PATH. This fixes issues where Bun installation succeeded but wasn't immediately usable in Git Bash.
- **Official Skills Plugin Implementation:** Created actual plugin implementations for GitHub, Google Drive, and Linear skills (previously just markdown files). These plugins use CLI tools (gh, gdrive/rclone, linear CLI) and API integrations to provide real functionality. Updated plugin loader to enable core plugins by default and added proper input schemas in runtime.ts.
- **Plugin Test Infrastructure:** Created dedicated test runner (`scripts/test-plugins.sh`) with test utilities (`src/test/plugin-test-utils.ts`), individual plugin test files, and comprehensive documentation (`TESTING.md`). Added `test:plugins` script to package.json for easy plugin testing.
- **Cross-Platform Test Runner:** Enhanced plugin test runner with full Windows compatibility - automatically detects Bun installation, handles PATH issues, and works seamlessly on Windows Git Bash. This fixes a critical usability issue for Windows developers.
- The core engine is extremely lean (~120 lines), making it highly portable and easy to reason about.

