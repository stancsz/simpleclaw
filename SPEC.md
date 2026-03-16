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

## 🗺️ Roadmap — High-Leverage Moves

> **Principle:** Every move must have a **local test that passes** before merging. No mock stubs — use local equivalents (SQLite for Supabase, file-based KMS for Cloud KMS, in-process workers for Cloud Functions). If it works locally, it works in production.

### Move 1: Real LLM Intent Parsing (Orchestrator)

**Status:** 🔴 Not started (currently returns hardcoded mock)  
**Priority:** #1 — everything downstream depends on this  

- [ ] Replace `mockParseIntentToManifest()` in `orchestrator.ts` with real LLM call
- [ ] Use OpenAI-compatible client (works with DeepSeek, OpenAI, Gemini via `openai` SDK)
- [ ] Structured output / function calling → typed `SwarmManifest`
- [ ] Validate returned DAG: acyclic, skills exist, credentials listed
- [ ] Support `DEEPSEEK_API_KEY` / `OPENAI_API_KEY` from env (BYOK)

**Local testing:**
- [ ] Integration test with a deterministic prompt → assert valid manifest structure
- [ ] Test with missing/invalid API key → assert graceful error (not crash)
- [ ] Test DAG validation: cyclic DAG → rejected, valid DAG → accepted
- [ ] All tests in `src/core/orchestrator.test.ts`, run via `bun test`

---

### Move 2: Motherboard SQL Schema + Local DB

**Status:** 🔴 Schema exists in SWARM_SPEC §9.2 only — never applied  
**Priority:** #2 — no DB = no state, no audit log, no sessions  

- [ ] Extract SQL from `SWARM_SPEC.md §9.2` into `src/db/schema.sql`
- [ ] Create `src/db/client.ts` — thin DB client wrapper
- [ ] Create migration runner: `src/db/migrations/001_motherboard.sql`
- [ ] Add `setup:db` npm script
- [ ] Wire `orchestrator.ts` to checkpoint sessions to `orchestrator_sessions`

**Local testing (SQLite equivalent):**
- [ ] Use **SQLite** (`better-sqlite3` or Bun's built-in `bun:sqlite`) as local Supabase equivalent
- [ ] Test: apply migration → all tables created → verify schema
- [ ] Test: insert session → read back → verify JSON fields
- [ ] Test: idempotency guard — duplicate `transaction_log` entry → skip
- [ ] Test: audit log writes on every state transition
- [ ] All tests in `src/db/db.test.ts`, run via `bun test`

---

### Move 3: Worker Dispatch + Execution Loop

**Status:** 🔴 Dispatcher exists but dispatches to local agent loop, not Workers  
**Priority:** #3 — this is the core product loop  

- [ ] Create `src/workers/template.ts` — universal Worker entry point
- [ ] Implement lifecycle: Boot → Load JIT Skill → Fetch credential → Execute → Write result → Terminate
- [ ] Wire `dispatcher.ts` to map `swarm.yaml` DAG steps → Worker invocations
- [ ] Implement `transaction_log` idempotency check before WRITE ops
- [ ] Workers write results to `task_results` table

**Local testing (in-process workers):**
- [ ] Workers run as **async functions in the same process** (no Cloud Functions needed)
- [ ] Test: dispatch 2-step DAG → both workers execute in correct order
- [ ] Test: parallel-safe workers (no `depends_on`) run concurrently
- [ ] Test: Worker WRITE with existing `transaction_log` entry → skipped (idempotent)
- [ ] Test: Worker failure → error written to `task_results`, not crash
- [ ] All tests in `src/workers/worker.test.ts`, run via `bun test`

---

### Move 4: Realign Terraform to Serverless

**Status:** 🔴 Current `main.tf` provisions an e2-micro VM — contradicts the swarm spec  
**Priority:** #4 — infrastructure must match architecture  

- [ ] Replace VM with `google_cloudfunctions2_function` for Orchestrator + Worker
- [ ] Add `google_kms_key_ring` + `google_kms_crypto_key`
- [ ] Add IAM bindings: only CF service account can `kms.decrypt`
- [ ] Add `terraform/variables.tf` with env-specific configs
- [ ] Stay within free-tier where possible

**Local testing (Terraform validate):**
- [ ] `terraform validate` passes
- [ ] `terraform plan` with dummy project ID → no errors
- [ ] Document required GCP APIs in `terraform/README.md`

---

### Move 5: End-to-End Integration Test

**Status:** 🔴 Only unit tests exist  
**Priority:** #5 — can't ship without confidence the core loop works  

- [ ] Create `tests/e2e/intent-to-result.test.ts`
- [ ] Full loop: Intent → Parse → Plan → Approve → Dispatch Workers → Collect Results
- [ ] Use local SQLite DB for state
- [ ] Mock only the LLM response (deterministic fixture)
- [ ] Assert: manifest valid, workers dispatched, results written, audit logged
- [ ] Add to CI: run on every PR

**Local testing:**
- [ ] Entire test runs in <10 seconds with no network calls
- [ ] Uses local DB + mocked LLM + in-process workers
- [ ] Run via `bun test tests/e2e/`

---

### Move 6: KMS Credential Flow (Security Foundation)

**Status:** 🔴 Not started  
**Priority:** #6 — enterprise trust differentiator  

- [ ] Create `src/security/kms.ts` — wraps encrypt/decrypt
- [ ] Create `src/security/onboarding.ts` — accepts user key, encrypts, stores ciphertext
- [ ] Worker template calls decrypt at boot, uses key in RAM, terminates
- [ ] Add to Terraform: KMS key ring + crypto key + IAM policy

**Local testing (file-based KMS equivalent):**
- [ ] Use **Node.js `crypto` module** as local KMS equivalent (AES-256-GCM)
- [ ] Interface is identical: `encrypt(plaintext) → ciphertext`, `decrypt(ciphertext) → plaintext`
- [ ] Swap to real GCP KMS via env flag (`KMS_PROVIDER=gcp|local`)
- [ ] Test: encrypt → decrypt → same plaintext
- [ ] Test: tampered ciphertext → decrypt fails gracefully
- [ ] Test: Worker lifecycle — boot with encrypted key → decrypt → use → terminate → key gone from memory
- [ ] All tests in `src/security/kms.test.ts`, run via `bun test`

---

### Quick Wins (Do Immediately)

- [ ] Fix `package-lock.json` sync (run `npm install` and commit lockfile)
- [ ] Add `bun test` to CI workflow
- [ ] Add `GET /health` endpoint to webhook server
- [ ] Pin Node.js version in `.nvmrc`
- [ ] Add `engines` field to `package.json`

---

### Future Phases (After Core Loop Works)

#### Phase 1 — Self-Service MVP
- [ ] GitHub + Google OAuth login
- [ ] Guided Supabase onboarding
- [ ] BYOK key management UI (Supabase Vault)
- [ ] Plan-Diff-Approve UI
- [ ] Standard Library: 10 Skills
- [ ] Gas Tank + Stripe integration

#### Phase 2 — Scheduling & Continuous Mode
- [ ] Cron + webhook trigger system
- [ ] 30-minute heartbeat protocol
- [ ] Multi-worker parallel dispatch
- [ ] Full Motherboard schema v1.0 + integrity checker
- [ ] BYOS: GitHub skill import

#### Phase 3 — Marketplace & Enterprise
- [ ] Public skill marketplace
- [ ] Full OIDC auth (zero stored credential)
- [ ] Enterprise SSO, multi-region Cloud Functions
- [ ] 50+ Standard Library skills

---

## 📁 Repository Structure

```
simpleclaw/
├── src/
│   ├── core/          # Orchestrator engine — intent parsing, manifest building, dispatch
│   ├── db/            # Database client, schema, migrations (SQLite local / Supabase prod)
│   ├── workers/       # Worker function templates — ephemeral task executors
│   ├── security/      # KMS wrapper, onboarding, triple lock
│   ├── plugins/       # Local plugin integrations (browser, screencap, etc.)
│   └── test/          # Shared test utilities
├── tests/
│   └── e2e/           # End-to-end integration tests (full loop)
├── server/            # Next.js dashboard UI
├── terraform/         # GCP infrastructure (Cloud Functions, KMS key rings, IAM)
├── .agents/           # Developer agent workspace (dogfood loop, skills, memory)
├── .github/           # CI/CD workflows + automated code review
├── SWARM_SPEC.md      # Master architecture specification (source of truth)
├── SPEC.md            # This file — engineering mission summary
└── CLAUDE.md          # Agent workspace + task tracking
```

---

*SimpleClaw — Stupidly Simple. Stupidly Scalable. Radically Sovereign. 🦀*
