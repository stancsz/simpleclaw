# CLAUDE.md - SimpleClaw

## MISSION
SimpleClaw is a **stateless meta-orchestrator**. Its primary mission is to convert natural language intent into a structured execution plan and **delegate the heavy lifting to specialized sub-agents and execution engines (like `opencode`)**.

It dispatches ephemeral Cloud Functions (Workers/Sub-Agents) that receive credentials (KMS-decrypted at runtime), load JIT skills, and execute tasks against the user's own Supabase (the Sovereign Motherboard). SimpleClaw is the "Brain" that coordinates the "Muscle" of sub-agents.

**Source of truth for architecture:** [`SWARM_SPEC.md`](./SWARM_SPEC.md)
**Engineering summary:** [`SPEC.md`](./SPEC.md)

# AGENT WORKSPACE (MODIFIABLE BY AGENT)
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
- [x] **Phase 0 — Orchestrator CF:** Single Cloud Function: text prompt → `swarm.yaml` manifest
- [ ] **Phase 0 — Worker Template:** Ephemeral CF that boots, loads JIT skill, fetches KMS-decrypted credential, executes, terminates
- [ ] **Phase 0 — KMS Flow:** GCP Cloud KMS key ring setup + encrypt/decrypt service for Supabase `service_role` keys
- [ ] **Phase 0 — Motherboard Schema:** Apply `SWARM_SPEC.md §9.2` SQL schema to a managed Supabase project
- [ ] **Phase 0 — Minimal UI:** Text input → plan display → approve button (Next.js dashboard in `server/`)
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

