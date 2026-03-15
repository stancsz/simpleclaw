# SimpleClaw Project Scaffold Skill

Use this skill when setting up SimpleClaw on a new machine or fresh git clone. These files are intentionally **gitignored** (they contain secrets or machine-specific state), but the project cannot run without them. This skill teaches you how to generate each one correctly.

---

## Files to Scaffold

### 1. `.env` — Environment Configuration

Create `.env` in the project root. Never commit this file.

```bash
# AI Model Configuration (DeepSeek)
OPENAI_API_KEY=sk-<your-deepseek-api-key>   # get from platform.deepseek.com
OPENAI_BASE_URL=https://api.deepseek.com
AGENT_MODEL=deepseek-chat

# Discord Credentials
DISCORD_BOT_TOKEN=<your-bot-token>
DISCORD_CLIENT_ID=<your-client-id>
DISCORD_GUILD_ID=<your-guild-id>
DISCORD_CHANNEL_ID=<your-channel-id>

# Plugin Activation
ENABLE_DISCORD=true
ENABLE_WHATSAPP=false
ENABLE_MESSENGER=false
ENABLE_BROWSER=true

# Local Mode (SQLite — no Supabase needed)
LOCAL_MODE=true
NEXT_PUBLIC_SUPABASE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_ANON_KEY=local-mode-key
```

**Key notes:**
- `OPENAI_API_KEY` holds your DeepSeek API key (the app and `custom/script.sh` uses the OpenAI-compatible interface)
- `LOCAL_MODE=true` enables SQLite so you don't need a Supabase instance

---

### 2. `CLAUDE.md` — Agent Task State

Create `CLAUDE.md` in the project root. This is the agent's working memory for the current task. The `custom/script.sh` runner reads this on every cycle and resets it via `git checkout -- CLAUDE.md` after each run.

```markdown
# CLAUDE.md - SimpleClaw

## MISSION
SimpleClaw is a high-performance, local-first autonomous agent workstation. It bridges the gap between LLM reasoning and real-world OS execution.

## AGENT WORKSPACE (MODIFIABLE BY AGENT)

## CURRENT TASK
- Describe the current task here in bullet points.
- The agent will read this and execute the next high-leverage move.

## BACKLOG (The High-Leverage Queue)
- [ ] Item 1
- [ ] Item 2

## DISCOVERY LOG
- Key architectural facts learned during past sessions go here.
```

**Key notes:**
- Keep "CURRENT TASK" focused — the agent picks the next move from it each cycle
- "DISCOVERY LOG" persists important facts across sessions (since the file is reset by git after each run)
- Track the task status with checkboxes in BACKLOG

---

### 3. `SPEC.md` — Project Specification

Create `SPEC.md` in the project root. This is the long-form product spec and roadmap. The agent reads it alongside `CLAUDE.md` to understand what SimpleClaw is trying to achieve.

Structure it with:
- Vision & Goals
- Architecture overview
- Key Features
- Roadmap (Phases with checkboxes)

See `README.md` for a starting point — `SPEC.md` is the more detailed technical version.

---

### 4. `.agents/comm/OUTBOX.md` — Agent Communication

Create the file at `.agents/comm/OUTBOX.md`. This is the human-to-agent task queue.

```markdown
## OUTBOX

No tasks assigned yet. Awaiting instructions.

Checked: <today's date>
```

To assign the agent a task, add it here:
```markdown
## OUTBOX

### Task: [Short title]
[Full description of what you want the agent to do]

Checked: <today's date>
```

The agent reads OUTBOX on startup and writes results to `.agents/comm/INBOX.md`. Both files are gitignored — they are ephemeral communication channels.

---

### 5. `.agents/memory/memory.md` — Agent Long-Term Memory

Create the file at `.agents/memory/memory.md`. This accumulates knowledge the agent learns across sessions.

```markdown
# SimpleClaw Long-Term Memory
This file contains key information, preferences, and project details learned during interactions.

## Core Identity
- **Name**: SimpleClaw
- **Version**: 1.0.0
- **Model**: deepseek-chat
- **Specialties**: Web browsing, local development, task automation.

## User Preferences
- [Add preferences here as the agent learns them]

## Project Details
- **Architecture**: Plugin-based system with a centralized reasoning loop in `src/core/`.
- **Database**: Local SQLite (LOCAL_MODE=true).
- **Plugins**: Discord (Active), Browser (Active).

## Knowledge Entries
- [YYYY-MM-DD] [entry]
```

**Key notes:**
- This file grows over time as the agent appends what it learns
- Keep it trimmed — if it exceeds ~200 lines, summarize and archive old entries
- It is gitignored intentionally to protect agent context from being committed

---

### 6. `.devcontainer/` — Dev Container (Optional)

The `.devcontainer/` directory configures a sandboxed VS Code dev container with firewall rules for safe agent execution. It is gitignored because it contains environment-specific settings.

If you need it, copy it from a teammate or recreate with these three files:

**`devcontainer.json`** — Points to the Dockerfile, sets workspace mount, VS Code extensions (ESLint, Prettier, GitLens), and runs the firewall init script on container start.

**`Dockerfile`** — Extends a Node.js base image, installs `opencode-ai` globally, sets up zsh with oh-my-zsh, and configures the dev environment.

**`init-firewall.sh`** — Sets up `iptables` rules to restrict outbound traffic to only approved hosts (AI API endpoints, npm registry, GitHub). Protects against runaway agent network calls.

To get started without the devcontainer, just use the host directly — the devcontainer is a "nice-to-have" sandbox, not required for local dev.

---

## Running the Dogfood Loop

Once all files above exist:

```bash
# Run one cycle (good for testing)
DOGFOOD_ONCE=1 bash loop/dogfood.sh

# Run for 4 hours (default)
bash loop/dogfood.sh

# Run with the reasoning model
OPENCODE_MODEL=deepseek/deepseek-reasoner bash loop/dogfood.sh

# Override runtime
RUN_HOURS=8 bash loop/dogfood.sh
```

The runner (`loop/dogfood.sh`) will:
1. Source `.env` automatically
2. Map `OPENAI_API_KEY` → `DEEPSEEK_API_KEY` for opencode
3. Read `CLAUDE.md`, `SPEC.md`, and `OUTBOX.md` each cycle
4. Invoke `opencode run` with a structured 5-step self-improvement prompt
5. Reset `CLAUDE.md` via `git checkout` after each cycle
6. Write cycle results to `.agents/comm/INBOX.md`
7. Sleep 10s and repeat until the time window expires
