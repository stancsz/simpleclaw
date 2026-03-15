# 🦀 SimpleClaw — Meta-Orchestrator

SimpleClaw is a **stateless intent-to-action meta-orchestration engine**. It accepts natural language from a user, breaks it into a structured execution plan, and **delegates the heavy lifting to specialized sub-agents (e.g., `opencode`)** via ephemeral Workers. SimpleClaw acts as the "Command & Control" center, while sub-agents provide the specialized muscle.

It is the open-source implementation of the **Beautiful Swarms** architecture defined in [`SWARM_SPEC.md`](./SWARM_SPEC.md).

---

## 🎯 Mission

> *"You describe the job. SimpleClaw assembles the crew, delegates tasks to sub-agents, uses your tools, runs in your house — and leaves no trace."*

SimpleClaw is a **Meta-Orchestrator** that:

1. **Parses intent** — Converts natural language into a `swarm.yaml` execution manifest (DAG of sub-agent tasks)
2. **Delegates to Sub-Agents** — Dispatches ephemeral Workers (GCP Cloud Functions / AWS Lambda) that invoke specialized agents like **`opencode`** to perform coding, research, or complex logic.
3. **Coordinates Workers** — Each Worker receives instructions + decrypted credentials at runtime and reports results back to the orchestrator.
4. **Uses the user's own infrastructure** — BYOK (AI keys), BYOI (Supabase DB), BYOS (custom skills)
5. **Enforces Sovereignty** — The platform remains stateless; all data and intelligence remains in the user's environment.

---

## 🏗️ Architecture

```
User Intent (natural language)
        │
        ▼
┌─────────────────────┐
│   ORCHESTRATOR      │  ← Long-running Cloud Function (stateless checkpoints)
│   (SimpleClaw Core) │    Parses intent → builds swarm.yaml → presents Plan-Diff-Approve
└────────┬────────────┘
         │ dispatches
         ▼
┌─────────────────────────────────────────┐
│         WORKER LAYER (Ephemeral)        │
│  Worker A  │  Worker B  │  Worker C     │
│  ─────────   ─────────   ─────────      │
│  Boots      Boots        Boots          │
│  Loads Skill (JIT)       Loads Skill    │
│  Fetches KMS-decrypted   Fetches KMS    │
│    credential            credential     │
│  Executes task           Executes task  │
│  Writes result to        Writes result  │
│    user's Supabase       Terminates     │
│  Terminates                             │
└─────────────────────────────────────────┘
         │ all state lives in
         ▼
┌─────────────────────────────────────────┐
│     USER'S SOVEREIGN MOTHERBOARD        │
│           (User's Supabase)             │
│  orchestrator_sessions │ task_results   │
│  vault.user_secrets    │ audit_log      │
│  heartbeat_queue       │ skill_refs     │
│  gas_ledger            │ transaction_log│
└─────────────────────────────────────────┘
```

### Key Components

| Component | Description |
|---|---|
| **Orchestrator** | The brain. Long-running (but stateless-checkpoint-based) Cloud Function. Talks to the user, builds manifests, dispatches Workers. |
| **Workers** | The muscle. Ephemeral Cloud Functions (1–30s lifetime). Each executes one specific task using JIT-loaded skills + decrypted credentials. |
| **Skill Vault** | Markdown-based instruction files that teach Workers how to perform specific capabilities (Shopify, Slack, GitHub, etc.) |
| **Sovereign Motherboard** | The user's own Supabase instance provisioned with the standard SimpleClaw SQL schema — the single source of truth for all state. |
| **KMS Credential Layer** | GCP Cloud KMS encrypts the user's Supabase `service_role` key. Workers decrypt it ephemerally at runtime — never stored in plaintext. |

---

## 🔐 How Cloud Functions Access User Supabase

Workers need to read/write the user's Supabase, but the platform **never stores a plaintext `service_role` key**. The mechanism:

```
Onboarding:
  User pastes Supabase URL + service_role key
  → Platform calls GCP Cloud KMS: encrypt(key) → ciphertext
  → Only ciphertext is stored in platform DB (plaintext discarded immediately)

Runtime (per Worker invocation):
  Worker receives user_id
  → Fetches KMS ciphertext from platform DB
  → Calls KMS.decrypt() → plaintext key appears in volatile RAM only
  → Creates Supabase client, executes task
  → Worker terminates → key is gone
```

**Security guarantee:** Platform DB breach = attacker gets KMS ciphertext only. The KMS key never leaves GCP's HSM. Every decrypt is IAM-gated and audit-logged.

→ See [SWARM_SPEC.md §10.2](./SWARM_SPEC.md) for the full staged auth model (KMS → OIDC for enterprise).

---

## 🚀 Core Features

### 🧠 Intent-to-Manifest Parsing
Natural language → `swarm.yaml` DAG via the user's BYOK LLM key. The platform uses the user's own OpenAI/Gemini/DeepSeek key — zero token cost to the platform.

### ✅ Plan-Diff-Approve
Before any write operation executes, the user sees a full plan preview: which Workers run, which credentials are accessed (masked), what will be read vs. written. Approve → Execute. No surprises.

### ⚙️ JIT Skill Loading
Workers load Skill Markdown files just-in-time from the platform marketplace, a GitHub URL, or the user's own `skill_refs` table. Skills are human-readable instruction sets, not executable code.

### 🔑 BYOK + BYOI + BYOS
- **BYOK:** User's own AI API keys (OpenAI, Gemini, Anthropic, DeepSeek)
- **BYOI:** User's own Supabase as the Sovereign Motherboard
- **BYOS:** User's own skills from any public GitHub repo

### 💧 Harness Toll (Gas Tank)
Users pre-purchase credits. Each Orchestrator execution debits credits. No subscriptions, no idle cost, ~95%+ margin at scale.

### ⏰ Continuous Mode (Heartbeat)
Recursive 30-minute heartbeat via Supabase `pg_cron`. Scheduling lives in the user's own DB — survives platform outages.

### 🔄 Idempotency
Every Worker checks a `transaction_log` before executing any write. Heartbeat double-fires are safe.

---

## 🗺️ Roadmap

### Phase 0 — Proof of Concept (Weeks 1–4)
- [ ] Single Cloud Function that accepts a text prompt and returns a `swarm.yaml` plan
- [ ] Hardcoded single-skill Worker execution (Shopify read)
- [ ] Basic Supabase Motherboard schema (v0)
- [ ] KMS credential encryption/decryption flow
- [ ] Minimal UI: text input → plan display → approve button

### Phase 1 — Self-Service MVP (Weeks 5–10)
- [ ] GitHub + Google OAuth login
- [ ] Guided Supabase onboarding (one-click managed setup)
- [ ] BYOK key management UI (Supabase Vault integration)
- [ ] Plan-Diff-Approve UI
- [ ] Standard Library: 10 Skills (Shopify, Slack, Google Sheets, Gmail, Linear)
- [ ] Gas Tank + Stripe integration
- [ ] Real-time execution monitor

### Phase 2 — Scheduling & Continuous Mode (Weeks 11–16)
- [ ] Cron + webhook trigger system
- [ ] 30-minute heartbeat protocol
- [ ] Multi-worker parallel dispatch
- [ ] Full Motherboard schema v1.0 + integrity checker (`swarms.verify_motherboard_integrity()`)
- [ ] BYOS: GitHub skill import + file upload

### Phase 3 — Marketplace & Enterprise (Weeks 17+)
- [ ] Public skill marketplace (community contributed)
- [ ] Full OIDC auth (zero stored credential — enterprise tier)
- [ ] Enterprise SSO, multi-region Cloud Functions
- [ ] 50+ Standard Library skills

---

## 📁 Repository Structure

```
simpleclaw/
├── src/
│   ├── core/          # Orchestrator engine — intent parsing, manifest building, dispatch
│   ├── workers/       # Worker function templates (per-skill)
│   └── plugins/       # Local plugin integrations (browser, screencap, etc.)
├── server/            # Next.js dashboard UI
├── terraform/         # GCP infrastructure (Cloud Functions, KMS key rings, IAM)
├── .agents/           # Developer agent workspace (dogfood loop, skills, memory)
├── SWARM_SPEC.md      # Master architecture specification (source of truth)
└── SPEC.md            # This file — engineering mission summary
```

---

*SimpleClaw — Stupidly Simple. Stupidly Scalable. Radically Sovereign. 🦀*
