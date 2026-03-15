# SimpleClaw CI/CD & Autonomy System

This directory contains the automation logic for SimpleClaw's autonomous development loop.

## Components

### 🤖 Orchestrator (`orchestrator.ts`)
- **Schedule**: Every hour at :30.
- **Logic**:
    1. Reads `CLAUDE.md`, `SPEC.md`, and `SWARM_SPEC.md`.
    2. Fetches open PRs to avoid duplication.
    3. Uses DeepSeek to identify the absolute NEXT meaningful task.
    4. Delegates the task to **Jules** (vias `opencode`).
    5. Jules is instructed to read `CLAUDE.md`, execute the task, and update the workspace/backlog.
    6. Commits and pushes any changes made by Jules to `main`.

### 🔍 Reviewer (`reviewer.ts`)
- **Schedule**: Every hour at :00.
- **Logic**:
    1. Fetches open PRs.
    2. Reviews the PR diff and checks if `CLAUDE.md` was updated.
    3. Uses DeepSeek to decide if the PR should be **MERGED** or **CLOSED**.
    4. If merged, leaves a formatted note in `CLAUDE.md` on the `main` branch.
    5. If closed, leaves a feedback comment explaining why.

## Environment Variables Needed (GitHub Secrets)
- `DEEPSEEK_API_KEY`: API key for DeepSeek (used for delegation reasoning).
- `JULES_API_KEY`: Google Cloud API key for Jules (the development agent).
- `GH_TOKEN`: Your GitHub PAT with repo permissions (secret named GH_TOKEN).

## Technical Details
- Built with TypeScript and run via `tsx`.
- Uses `opencode-ai` as the execution engine for delegated tasks.
- Heavily relies on `CLAUDE.md` as the shared brain between the Orchestrator (brain) and Jules (muscle).
