# Beautiful Swarms — Master Specification
*Intent-to-Action · Sovereign Infrastructure · Stateless Orchestration*

> **Version:** 1.1 — Updated March 2026
> **Status:** Pre-Prototype · Source of Truth for Engineering Team
> **Key Decision Added:** Cloud Function → Supabase Auth Model (KMS-Encrypted Credential, staged to OIDC)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Philosophy & First Principles](#2-philosophy--first-principles)
3. [Product Vision](#3-product-vision)
4. [High-Level Architecture](#4-high-level-architecture)
5. [Core Concepts & Terminology](#5-core-concepts--terminology)
6. [The Intent-to-Action Workflow](#6-the-intent-to-action-workflow)
7. [Orchestrator — The Brain](#7-orchestrator--the-brain)
8. [Workers — The Muscle](#8-workers--the-muscle)
9. [The Sovereign Motherboard (User Supabase)](#9-the-sovereign-motherboard-user-supabase)
10. [Security Architecture](#10-security-architecture)
11. [Skills & Marketplace](#11-skills--marketplace)
12. [Business Model — The Harness Toll](#12-business-model--the-harness-toll)
13. [Onboarding — Self-Service Flow](#13-onboarding--self-service-flow)
14. [Heartbeat & Continuous Mode](#14-heartbeat--continuous-mode)
15. [Scaling Strategy](#15-scaling-strategy)
16. [Design Language — Adaptive Minimalism](#16-design-language--adaptive-minimalism)
17. [Threat Model & Incident Response](#17-threat-model--incident-response)
18. [Roadmap](#18-roadmap)
19. [Appendix — Key Decisions Log](#19-appendix--key-decisions-log)

---

## 1. Executive Summary

**Beautiful Swarms** is an *Intent-to-Action* orchestration platform. It is the infrastructure layer that sits between what a user *wants to do* and the actual cloud execution that *gets it done*.

Rather than being a traditional SaaS platform that stores user data, manages credentials, and locks users into a proprietary ecosystem, Beautiful Swarms operates as a **Ghost Orchestrator** — a stateless intelligence layer that briefly inhabits the user's own infrastructure, executes a task, and vanishes. The user owns everything; the platform charges only for the intelligence layer that makes it happen.

### What it is NOT

- ❌ Not an AI model provider
- ❌ Not an API aggregator
- ❌ Not a data warehouse or credential vault
- ❌ Not a monolithic SaaS application with heavy backend state

### What it IS

- ✅ A **stateless execution harness** for distributed AI agent swarms
- ✅ A **marketplace of composable skills** that workers can load just-in-time
- ✅ A **Bring Your Own Key (BYOK)** + **Bring Your Own Infrastructure (BYOI)** platform
- ✅ A **Ghost Orchestrator** — platform-as-a-toll, not platform-as-a-landlord
- ✅ A **Verified Execution Environment** where users approve before anything runs

### Core Value Proposition

> *"You describe the job. The platform assembles the crew, uses your tools, runs in your house, charges you a small toll — and leaves no trace."*

This mirrors the **gig economy model** (like Fiverr or Upwork) but applied to autonomous AI agents. The user defines a project. The platform breaks it into discrete tasks. Workers are dispatched to execute them in parallel. Results are returned. The platform disappears.

---

## 2. Philosophy & First Principles

### 2.1 Stupidly Simple, Stupidly Scalable

Every architectural decision must be evaluated against this dual constraint. If it requires the platform to manage state, it fails the first test. If it cannot serve 10,000 users without linear cost growth, it fails the second.

**Rules:**
1. The platform is a **router, not a host**
2. Everything that *can* be stateless *must* be stateless
3. The user's infrastructure manages itself; the platform does not babysit it
4. If the platform goes offline, the user's scheduled tasks keep running on their own cloud

### 2.2 Sovereignty of Data

The user's data belongs to the user. This is not a marketing stance — it is a hard architectural constraint. The platform must never:

- Store the user's raw API keys
- Hold decrypted credentials in persistent memory
- Act as a single point of failure for user secrets

The platform's security posture is **Zero-Knowledge Orchestration**. It signs in as a delegated agent, uses secrets ephemerally in volatile RAM, and forgets them immediately.

### 2.3 Trust is Earned Through Transparency

The **Plan-Diff-Approve** cycle is the foundation of user trust. No worker ever executes a write operation without the user seeing exactly what will happen first. The platform shows a visual DAG (Directed Acyclic Graph) of the planned swarm steps and a diff of what data will be read and what will change.

### 2.4 Infrastructure Arbitrage

The platform's business model is structurally asymmetric:
- **COGS = ~$0** — Users bring their own AI keys (no token cost to platform)
- **Storage = $0** — Users bring their own Supabase/Google Drive
- **Compute = ~$0.001/invocation** — Cloud Functions billed by execution milliseconds
- **Revenue = Harness Toll** — Charged per orchestration execution, nearly 100% margin

### 2.5 The Market Problem Being Solved (2026 Context)

The AI industry is in the **Agentic Chasm** of 2026:
- Global AI spend: ~$300B
- Agentic project failure rate: ~40% through 2027 ("Pilot Purgatory")
- Root causes: Cost overruns, credential friction, hallucination loops, no deterministic guardrails

Beautiful Swarms solves the **Credential Friction** and **Verified Execution** gaps that prevent enterprises from trusting autonomous agents with real operations.

---

## 3. Product Vision

### 3.1 The Analogy

Think of Beautiful Swarms like hiring a contractor through a gig platform (Fiverr/Upwork), but the contractor is an AI swarm:

1. **You post the job** (natural language intent)
2. **The platform assembles the crew** (breaks intent into a worker manifest)
3. **You approve the plan** (Plan-Diff-Approve)
4. **The crew uses your tools** (BYOK, BYOI)
5. **The job is done, crew leaves** (stateless, ephemeral execution)
6. **You pay a small commission** (Harness Toll per execution)

### 3.2 Target Users

| Segment | Example Use Case |
|---|---|
| E-commerce operators | "Automate Shopify order reconciliation every night" |
| Marketing teams | "Monitor social mentions and draft daily digest" |
| Finance ops | "Pull invoices from email, categorize in spreadsheet" |
| Developer teams | "Run regression checks against staging every 6 hours" |
| Small business owners | "When a new Stripe payment comes in, update my Notion CRM" |

### 3.3 The Equivalent

The closest analogy in the market is **Open Canvas / Claude** — platforms where users describe a task and an agent executes it continuously. Beautiful Swarms differs by:

- Being **multi-worker** (parallel swarm vs. single agent)
- Being **Bring Your Own** everything (BYOK, BYOS, BYOI)
- Having **enterprise-grade security** (Zero-Knowledge, OIDC, Vault)
- Being **schedulable** (webhook + cron trigger vs. chat-only)
- Being **verifiable** (Plan-Diff-Approve before every write operation)

### 3.4 Directional North Star

> **"Build the Intelligent Grid, not the Utility Company."**

Beautiful Swarms is not the provider of AI intelligence — it is the grid that intelligently routes user intent to user-owned execution resources. Like an electrical grid that doesn't own the appliances, the platform provides the connective intelligence layer and charges a transmission fee.

---

## 4. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER INTERFACE                           │
│          (Web App — Adaptive Minimalism, 2026 Design)           │
│   Natural Language Input │ Plan-Diff-Approve UI │ Dashboard     │
└────────────────┬────────────────────────────────────────────────┘
                 │ HTTPS / WebSocket
┌────────────────▼────────────────────────────────────────────────┐
│              PLATFORM ORCHESTRATION LAYER (Stateless)           │
│                                                                 │
│  ┌─────────────────┐   ┌──────────────────┐  ┌──────────────┐  │
│  │  Intent Parser  │   │ Manifest Builder │  │ Auth (OIDC)  │  │
│  │  (LLM → DAG)    │   │ (swarm.yaml gen) │  │ GitHub/Google│  │
│  └────────┬────────┘   └────────┬─────────┘  └──────┬───────┘  │
│           │                     │                    │          │
│  ┌────────▼─────────────────────▼────────────────────▼───────┐ │
│  │              ORCHESTRATOR (Long-Running Cloud Function)    │ │
│  │  - Talks to user in natural language                       │ │
│  │  - Manages schedule / heartbeat                            │ │
│  │  - Dispatches Worker invocations                           │ │
│  │  - Reads/writes state via user's Supabase only             │ │
│  └────────────────────────────┬───────────────────────────────┘ │
└───────────────────────────────│─────────────────────────────────┘
                                │ Dispatches Workers
┌───────────────────────────────▼─────────────────────────────────┐
│                   WORKER LAYER (Ephemeral, JIT)                 │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  Worker A    │  │  Worker B    │  │  Worker C            │  │
│  │  (CF/Lambda) │  │  (CF/Lambda) │  │  (CF/Lambda)         │  │
│  │  JIT Skills  │  │  JIT Skills  │  │  JIT Skills          │  │
│  │  BYOK Proxy  │  │  BYOK Proxy  │  │  BYOK Proxy          │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
└─────────│─────────────────│──────────────────────│─────────────┘
          │                 │                      │
          └─────────────────┴──────────────────────┘
                            │ All read from / write to
┌───────────────────────────▼─────────────────────────────────────┐
│              USER'S SOVEREIGN MOTHERBOARD (Supabase)            │
│                                                                 │
│  vault.secrets  │  tasks  │  heartbeat_queue  │  audit_log      │
│  credentials    │  state  │  gas_ledger        │  skill_refs     │
└─────────────────────────────────────────────────────────────────┘
```

### Key Principle: The Platform is a Ghost

The platform's Cloud Functions hold **zero persistent state**. Between invocations, the platform does not exist. State lives exclusively in the user's Supabase instance. This is by design — it means:

- The platform can be redeployed, updated, or replaced without data loss
- A platform outage does not corrupt user data
- Users can theoretically "eject" from the platform and run workers directly against their own Supabase

---

## 5. Core Concepts & Terminology

| Term | Definition |
|---|---|
| **Intent** | A natural language description of what the user wants the swarm to accomplish |
| **Manifest (swarm.yaml)** | A structured machine-readable execution plan derived from intent |
| **Orchestrator** | A long-running (but stateless-checkpoint-based) Cloud Function that manages context, scheduling, and worker dispatch. It talks to the user. |
| **Worker** | An ephemeral Cloud Function (Lambda/GCF) that executes a single, specific task. It lives for seconds and forgets everything. |
| **Skill** | A Markdown-based instruction set that teaches a Worker how to perform a specific capability (e.g., "Shopify Order Sync Skill") |
| **BYOK** | Bring Your Own Key — user provides their own OpenAI/Gemini/DeepSeek/etc. API keys |
| **BYOS** | Bring Your Own Skills — user provides custom skill files or public GitHub repos containing skills |
| **BYOI** | Bring Your Own Infrastructure — user provides their own Supabase DB and optionally Google Drive |
| **Sovereign Motherboard** | The user's Supabase instance — the single source of truth for all user state, secrets, and scheduling |
| **Harness Toll** | The platform's revenue mechanism — a small charge per orchestration invocation |
| **Gas Tank** | The user's pre-purchased credit balance that is debited per execution (like gas for the swarm) |
| **JIT Skill Loader** | The mechanism by which a Worker downloads and reads a Skill at runtime, before executing |
| **Heartbeat** | A 30-minute recurring trigger that keeps a Continuous Mode Orchestrator alive |
| **Plan-Diff-Approve** | The three-step verification UI before any write operation executes |
| **Ghost Orchestrator** | The platform's role — a stateless intelligence layer that exists only during execution |
| **Zero-Knowledge** | The platform's security posture — it never holds decrypted secrets in persistent storage |
| **OIDC** | OpenID Connect — the delegated auth standard used to allow the platform to sign in to user's Supabase as the user |

---

## 6. The Intent-to-Action Workflow

This is the core execution loop — the product's defining experience.

### Step 1 — Intent Capture

The user types (or speaks) their goal in plain language:

> *"Every night at 2am, pull all unfulfilled Shopify orders from the last 24 hours, check inventory in Google Sheets, and send me a Slack summary."*

### Step 2 — Intent Parsing (LLM → DAG)

The Orchestrator processes the intent using the user's BYOK LLM key. It generates:

1. A **Directed Acyclic Graph (DAG)** of steps — a visual plan
2. A list of **required Skills** (Shopify Skill, Google Sheets Skill, Slack Skill)
3. A list of **required credentials** to be fetched from Vault
4. A **schedule string** (cron: `0 2 * * *`)

### Step 3 — Plan-Diff-Approve

Before anything executes, the user sees:

```
📋 PLAN
────────────────────────────────
Step 1: [Worker A] Fetch Shopify orders (READ)
        → Credential: shopify_api_key
        → Scope: orders?status=unfulfilled&created_at_min={24h_ago}

Step 2: [Worker B] Cross-reference Google Sheets (READ)
        → Credential: google_oauth_token
        → Sheet: "Inventory Master" → Column D (Stock Count)

Step 3: [Worker C] Post Slack digest (WRITE)
        → Credential: slack_bot_token
        → Channel: #ops-daily
        → Message: [preview shown]
────────────────────────────────
⚠️  WRITE OPERATIONS: 1 (Slack post)
📖  READ OPERATIONS: 2

[ Approve & Schedule ] [ Edit Plan ] [ Cancel ]
```

Only after the user approves does anything execute.

### Step 4 — Worker Dispatch

The Orchestrator dispatches Workers in optimal parallel order based on the DAG. Each Worker:

1. **Boots** (cold start: ~200ms for Cloud Function)
2. **Loads JIT Skills** from the user's `skill_refs` table or a GitHub URL
3. **Fetches ephemeral secrets** via `swarms.read_secret(secret_id)` RPC call
4. **Executes task** using decrypted key in volatile RAM only
5. **Writes result** back to user's Supabase `task_results` table
6. **Terminates** — secrets purged from memory, function instance dies

### Step 5 — Result Aggregation

The Orchestrator collects Worker outputs, assembles the final result, and presents it to the user. The execution is logged to the user's `audit_log` table (in their Supabase, not the platform's).

### Step 6 — Gas Debit

After successful execution, the Harness Toll is deducted from the user's Gas Tank ledger in real time via Stripe.

---

## 7. Orchestrator — The Brain

The Orchestrator is the **human-facing, conversational, long-running** component of the swarm.

### 7.1 Responsibilities

- Accepts natural language from the user
- Maintains conversational context (via checkpointed state in user's Supabase)
- Generates and presents the `swarm.yaml` manifest
- Manages schedules (cron + webhook triggers)
- Dispatches Workers
- Handles Worker failures and reports errors
- Requests human permission before Continuous Mode

### 7.2 Execution Model

The Orchestrator runs as a **Cloud Function** (GCP) or **Lambda** (AWS). Because serverless functions have timeout limits (~9 minutes), the Orchestrator uses **State Checkpointing** to remain logically persistent while being physically ephemeral:

```
Orchestrator Invocation 1:
  → Process intent
  → Generate manifest
  → Present Plan-Diff-Approve
  → Checkpoint state to Supabase: orchestrator_sessions table
  → Function terminates

[User approves via UI]
  → Webhook triggers new Orchestrator invocation

Orchestrator Invocation 2:
  → Hydrate context from orchestrator_sessions
  → Dispatch Workers
  → Wait for Worker completion signals
  → Checkpoint updated state
  → Function terminates
```

This pattern makes the Orchestrator **logically stateful but physically stateless** — the ideal serverless architecture.

### 7.3 Context Hydration

On each invocation, the Orchestrator hydrates its memory by reading:

```sql
SELECT * FROM orchestrator_sessions WHERE session_id = $1;
SELECT * FROM task_results WHERE session_id = $1 ORDER BY created_at;
SELECT * FROM skill_refs WHERE user_id = $1;
```

All of this data lives in the user's Supabase, not the platform's infrastructure.

---

## 8. Workers — The Muscle

Workers are **fire-and-forget, ephemeral, task-specific** Cloud Functions. They do not have opinions; they follow the `swarm.yaml` manifest exactly.

### 8.1 Properties

| Property | Value |
|---|---|
| Runtime | Cloud Function (GCF) or Lambda |
| Job | **Delegation** — Hands off task to a Sub-Agent or Execution Engine |
| Engine Examples | `opencode`, specialized LLM agents, native CLI tools |
| Lifetime | 1–30 seconds per invocation (or more if long-running engine) |
| State | Zero — reads from and writes to user's Supabase only |
| Secret access | Ephemeral — fetched at runtime, purged on exit |
| Parallelism | Full — multiple Workers can run simultaneously per session |
| Idempotency | Required — every Worker must check the `transaction_log` before executing a write |

### 8.2 The Delegation Model (Sub-Agents)

Workers are **not** large monolithic blobs of code. They are thin wrappers that:
1. **Hydrate Context:** Load relevant user state and skills from Supabase.
2. **Setup Environment:** Prepare the necessary credentials (KMS-decrypted).
3. **Dispatch to Engine:** Invoke an execution engine like **`opencode`** or a specialized Sub-Agent.
4. **Collect & Log:** Return the output to the Orchestrator and log to the Audit Log.

This keeps the platform's core code tiny while delegating the "heavy lifting" to state-of-the-art execution engines.

### 8.3 Idempotency Enforcement

Before any WRITE operation, a Worker checks:

```sql
SELECT id FROM transaction_log 
WHERE idempotency_key = $1 
AND status = 'completed';
```

If the operation has already been logged, the Worker skips it and returns the cached result. This prevents double-execution when heartbeat triggers fire twice.

---

## 9. The Sovereign Motherboard (User Supabase)

Every user's Supabase instance is provisioned with the **Beautiful Swarms SQL Motherboard** — a standardized schema that creates the universal execution environment.

### 9.1 Why Supabase?

- **Supabase Vault** (powered by `pgsodium`) provides transparent column encryption — secrets are encrypted at rest using hardware-level key management that lives in the user's own Postgres instance, not the platform's
- **Supabase Edge Functions** can serve as local heartbeat triggers
- **Row Level Security (RLS)** ensures the platform's service role can only access what it needs
- **Real-time subscriptions** allow the UI to reflect Worker progress live

### 9.2 Core Schema (SQL Motherboard)

```sql
-- Secrets vault (managed by Supabase pgsodium)
CREATE TABLE vault.user_secrets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,            -- e.g., 'openai_key', 'shopify_token'
    secret TEXT NOT NULL,          -- Encrypted by pgsodium automatically
    provider TEXT,                 -- 'openai' | 'gemini' | 'deepseek' | 'shopify' | ...
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Session / Orchestrator state
CREATE TABLE orchestrator_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    status TEXT DEFAULT 'active',  -- 'active' | 'waiting_approval' | 'running' | 'complete'
    context JSONB,                 -- Hydrated LLM context
    manifest JSONB,                -- The swarm.yaml as structured JSON
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Task results from Workers
CREATE TABLE task_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES orchestrator_sessions(id),
    worker_id TEXT,
    skill_ref TEXT,
    status TEXT,                   -- 'success' | 'error' | 'skipped'
    output JSONB,
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Immutable audit log
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID,
    event TEXT,                    -- 'intent_received' | 'plan_approved' | 'worker_dispatched' | ...
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Idempotency guard
CREATE TABLE transaction_log (
    idempotency_key TEXT PRIMARY KEY,
    status TEXT,
    result JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Heartbeat queue (for Continuous Mode)
CREATE TABLE heartbeat_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID,
    next_trigger TIMESTAMPTZ,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Gas ledger (credit balance)
CREATE TABLE gas_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    balance_credits BIGINT DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Skill references
CREATE TABLE skill_refs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    skill_name TEXT NOT NULL,
    source TEXT,                   -- 'platform' | 'github' | 'upload'
    ref TEXT,                      -- URL or file path
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 9.3 The `swarms.read_secret` RPC

Workers never receive raw API keys. Instead, they call a `SECURITY DEFINER` function that decrypts a secret ephemerally:

```sql
CREATE OR REPLACE FUNCTION swarms.read_secret(p_secret_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER  -- Runs as DB owner, not calling role
AS $$
DECLARE
    v_decrypted TEXT;
BEGIN
    -- Verify caller is the platform's service role
    IF current_setting('role') != 'service_role' THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    SELECT decrypted_secret 
    INTO v_decrypted
    FROM vault.decrypted_secrets
    WHERE id = p_secret_id;

    -- Log the access
    INSERT INTO audit_log(event, metadata)
    VALUES ('secret_accessed', jsonb_build_object('secret_id', p_secret_id, 'timestamp', NOW()));

    RETURN v_decrypted;
END;
$$;
```

The returned value is used in the Worker's volatile RAM for a single network call, then it goes out of scope. The platform never stores the decrypted value.

---

## 10. Security Architecture

### 10.1 Identity & Authentication

Users authenticate to the platform using **social login only**:

- GitHub OAuth
- Google OAuth
- Email (magic link via Supabase Auth)

No passwords. No API keys stored in the platform's own database for user identity.

### 10.2 Delegated Sovereign Auth — Staged Model

The hardest problem: **how does the platform's Cloud Function authenticate to the user's Supabase without storing a static `service_role` key in plaintext?**

#### Chosen Approach: KMS-Encrypted Credential (Option B)

At onboarding, the user provides their Supabase `service_role` key. The platform **never stores it in plaintext**. Instead:

```
Onboarding:
  1. User pastes their Supabase project URL + service_role key
  2. Platform backend immediately calls GCP Cloud KMS:
       encrypted_blob = KMS.encrypt(service_role_key, keyRing="swarms-user-keys")
  3. Only the encrypted_blob is written to the platform's DB:
       platform_db.users.set({ supabase_url, encrypted_service_role })
  4. Plaintext key is discarded — never written to any log or storage

Runtime (Cloud Function invocation):
  1. Cloud Function receives user_id in its invocation payload
  2. Fetches encrypted_service_role from platform DB
  3. Calls KMS.decrypt(encrypted_blob) → plaintext key in volatile RAM
  4. Constructs Supabase client: createClient(supabase_url, decrypted_key)
  5. Executes query / RPC against user's Supabase
  6. Function terminates — decrypted key is GONE from memory

At Rest:
  Platform DB holds: supabase_url + KMS ciphertext only
  KMS holds:         the symmetric key (hardware-protected, audit-logged)
  Plaintext key:     exists only in Cloud Function RAM, for milliseconds
```

**Why this is secure:**
- Even if the platform DB is breached, the attacker gets KMS ciphertext — useless without the KMS key
- The KMS key itself never leaves GCP's hardware security modules
- Every KMS decrypt call is audit-logged (who, when, for which operation)
- GCP IAM ensures only the Cloud Functions service account can call `kms.decrypt`
- Rotating a user's Supabase key = they re-paste it; platform re-encrypts; old ciphertext is discarded

#### Future Path: Full OIDC (Enterprise Tier, Phase 3+)

For users who want **true zero-knowledge** (platform cannot even decrypt a stored credential):

```
OIDC Trust Establishment:
  1. Platform operates its own OIDC issuer (issuer_url)
  2. User adds issuer_url to their Supabase Auth settings (one-time, guided UI)
  3. Supabase now trusts short-lived platform JWTs as valid session tokens

Runtime:
  1. Cloud Function generates a signed JWT (5-minute TTL) for the user
  2. Presents JWT to user's Supabase → validated against OIDC issuer
  3. Platform holds ZERO stored credential — not even ciphertext
  4. If the platform is fully compromised, attacker gets expired JWTs only
```

This path requires additional infrastructure (a JWT issuer service) and user-side Supabase configuration. It is the ultimate security posture but adds onboarding friction — reserved for enterprise.

#### Auth Model by Phase

| Phase | Auth Mechanism | Platform Stores | User Effort |
|---|---|---|---|
| Phase 0–1 | Platform-managed Supabase org | Nothing (own org) | Zero |
| Phase 1–2 | KMS-encrypted service_role **(current)** | KMS ciphertext only | Paste key once |
| Phase 3+ | Full OIDC (Enterprise) | Zero credentials | Configure Supabase Auth |

### 10.3 Secret Lifecycle

```
User provides secret → Encrypted by pgsodium in Supabase Vault
                     → Stored as ciphertext only (platform never sees plaintext)

Worker needs secret → Calls swarms.read_secret(id) via authenticated RPC
                    → Decrypted value returned in RPC response body
                    → Used in Worker volatile RAM for one HTTP call
                    → Worker function terminates — RAM cleared
                    → Decrypted value is GONE

Platform at rest    → Holds zero plaintext secrets
                    → Holds zero ciphertext (that's in user's Supabase)
                    → Only holds: user's email + gas_balance + platform JWT issuer config
```

### 10.4 Skill Sandboxing (BYOS Security)

User-provided or GitHub-sourced skills are Markdown files. They contain **instructions**, not executable code. The Worker's LLM reads and interprets them.

For skills that include code artifacts (e.g., a Python helper):
- Code is executed inside **gVisor-sandboxed** Cloud Function instances
- No outbound network calls except to pre-approved domains listed in the skill's manifest header
- Static analysis scan occurs at skill registration time (not at runtime)
- Skills that attempt to access `vault.user_secrets` directly are rejected

### 10.5 The Triple Lock

For production enterprise tier, the platform enforces:

1. **OIDC Auth** — JWT-based, short-lived, platform-issued
2. **IP Whitelisting** — User can restrict their Supabase to only accept connections from platform's known Cloud Function IP ranges
3. **RLS (Row Level Security)** — Even with a valid JWT, the platform can only read rows belonging to `auth.uid()` (the current user)

### 10.6 Hack Scenario Analysis

| Attack Vector | Impact | Mitigation |
|---|---|---|
| Platform cloud hacked | Attacker gets expired JWTs, no secrets | Short-lived OIDC tokens, no stored keys |
| User's Supabase hacked | Attacker gets encrypted blobs | pgsodium HSM keys, no plaintext stored |
| Platform OIDC issuer compromised | Attacker can forge platform JWTs | IP whitelist + RLS limits blast radius |
| Malicious skill uploaded | Env exposure risk | Static analysis + gVisor sandbox |
| Heartbeat triggers twice | Double-execution | Idempotency keys in transaction_log |

**Key Insight**: If the platform is compromised, the attacker gains the ability to *orchestrate* — to tell the user's Workers to run. They do NOT gain access to the user's raw credentials. The worst case is unauthorized task execution, not credential theft.

---

## 11. Skills & Marketplace

### 11.1 What is a Skill?

A Skill is a structured Markdown file that teaches a Worker how to perform a specific capability. It contains:

- **Metadata header** (YAML frontmatter): name, version, required credentials, allowed domains
- **Context section**: what the skill does
- **Tool usage instructions**: how to call APIs, what endpoints to use
- **Error handling**: what to do when API calls fail
- **Output format**: what the Worker should return

```markdown
---
skill_name: shopify-order-sync
version: 1.2.0
required_credentials:
  - shopify_api_key
  - shopify_store_domain
allowed_domains:
  - "*.myshopify.com"
author: beautiful-swarms-community
---

# Shopify Order Sync Skill

## Purpose
Fetch unfulfilled orders from a Shopify store within a given time window.

## Tool Usage
Use the HTTP GET tool to call:
`https://{shopify_store_domain}/admin/api/2024-01/orders.json?status=unfulfilled&created_at_min={start_time}`

Include header: `X-Shopify-Access-Token: {shopify_api_key}`

## Output Format
Return a JSON array of orders with fields: id, line_items, customer.email, total_price.
```

### 11.2 Skill Sources

| Source | Description | Vetting |
|---|---|---|
| **Platform Marketplace** | Curated, tested skills maintained by Beautiful Swarms | Full review, static analysis, versioned |
| **GitHub Import** | Public GitHub repo containing skill `.md` files | Automated static analysis at import time |
| **User Upload** | User uploads their own `.md` skill file | Sandboxed, user accepts responsibility |

### 11.3 Standard Library ("Genesis Swarms")

The platform launches with a curated standard library of high-value skills:

**E-Commerce**
- Shopify Order Sync
- Shopify Inventory Checker
- WooCommerce Reconciliation

**Productivity**
- Google Sheets Read/Write
- Notion Page Creator
- Airtable Sync

**Communication**
- Slack Digest Poster
- Discord Announcement
- Gmail Drafter

**Developer Ops**
- GitHub Issue Creator
- Linear Task Sync
- Vercel Deploy Status

**Finance**
- Stripe Revenue Report
- Invoice PDF Parser (via Google Drive)

### 11.4 Bring Your Own Skills (BYOS)

Users can contribute any public GitHub repo. To be compatible, the repo must have a `skills/` directory containing `.md` files with the YAML frontmatter schema.

```yaml
# Example: User pastes GitHub URL
skill_source: "https://github.com/myorg/my-automation-skills"
# Platform scans skills/ directory, validates schema, registers skills
```

---

## 12. Business Model — The Harness Toll

### 12.1 Core Model

Beautiful Swarms charges a **micro-toll per orchestration execution**. This is not a per-token charge (that belongs to the user's BYOK), but a charge for the platform's intelligence routing layer.

```
Revenue = (Number of Orchestrator Invocations) × (Toll per Invocation)
COGS    = (Cloud Function runtime) × (GCP/AWS per-millisecond rate)
Margin  ≈ 95%+ (at scale, cloud compute costs are negligible vs. toll)
```

### 12.2 The Gas Tank

Users pre-purchase credits ("Gas") via Stripe. Credits are debited after each successful execution:

| Plan | Gas Credits | Price | Cost per Execution |
|---|---|---|---|
| Starter | 1,000 credits | $10 | $0.01 |
| Builder | 10,000 credits | $80 | $0.008 |
| Scale | 100,000 credits | $500 | $0.005 |
| Enterprise | Custom | Custom | Negotiated |

### 12.3 What an "Execution" Is

One execution = one complete Orchestrator + Worker cycle for a single intent resolution. Heartbeat-triggered re-executions (Continuous Mode) count as new executions.

### 12.4 No Subscription Lock-in

Users are not locked into monthly subscriptions. Gas credits never expire. This is intentional — the BYOK + BYOI model means the platform has no ongoing infrastructure cost per idle user. Only active users burn credits. Only active users generate revenue. The model is perfectly aligned.

### 12.5 Stripe-to-Ledger Integration

```
User buys Gas via Stripe
  → Stripe webhook fires → Platform API endpoint
  → Platform increments gas_ledger.balance_credits in user's Supabase
  → User's Supabase is the ledger; platform doesn't hold payment state

Post-execution:
  → Worker completes
  → Orchestrator calls platform API: "debit 1 credit for user X"
  → Platform reads gas_ledger from user's Supabase
  → Decrements balance
  → If balance = 0, platform suspends new dispatches and notifies user

Low balance alert:
  → When balance < 100 credits, send notification
  → Optional: auto-refill via Stripe Payment Intent
```

---

## 13. Onboarding — Self-Service Flow

### Goal: From Zero to First Swarm in < 5 Minutes

The onboarding experience must be "stupidly simple" — a new user should not need to read documentation to get started.

### Step 1 — Sign Up (10 seconds)

> "Continue with GitHub" or "Continue with Google"

No forms. No credit card required to start. Free trial credits included.

### Step 2 — Connect Your Infrastructure (90 seconds)

The user is prompted to set up their Sovereign Motherboard:

**Option A: One-Click Supabase Setup**
- User clicks "Create My Swarm Space"
- Platform generates a Supabase project via API (using a platform-managed Supabase org for starters)
- The SQL Motherboard schema is applied automatically
- On upgrade, user can migrate to their own Supabase org

**Option B: Bring Your Own Supabase (Power User)**
- User provides their Supabase project URL and `anon` key (not service_role)
- Platform presents the SQL Motherboard script for user to run
- User runs `supabase db push` or pastes into SQL editor
- Platform verifies schema integrity with a probe query
- User completes OIDC trust setup (guided UI: "Add this URL to your Supabase Auth settings")

### Step 3 — Add Your AI Key (30 seconds)

> "Which AI model would you like your swarm to use?"

User selects provider and pastes key:
- OpenAI (GPT-4o, GPT-5)
- Google (Gemini 2.0+)
- Anthropic (Claude Sonnet/Opus)
- DeepSeek (V3+)
- Other (any OpenAI-compatible endpoint)

Key is stored directly in user's Supabase Vault — never touches platform storage.

### Step 4 — Add Your First Skill (optional, 30 seconds)

Platform shows the Standard Library. User selects skills they care about (e.g., "Shopify", "Slack"). Skills are registered in the user's `skill_refs` table.

### Step 5 — Describe Your First Task

> "What would you like your swarm to do?"

User types their intent. The platform generates the first Plan. User reviews and approves. First execution runs.

---

## 14. Heartbeat & Continuous Mode

### 14.1 What is Continuous Mode?

When a user wants a swarm to run on a recurring schedule (not just once), they enable **Continuous Mode**. The Orchestrator asks for explicit permission before enabling it:

> *"This swarm will run every night at 2am and post to your Slack. It will consume approximately 30 Gas credits per month. Allow Continuous Mode?"*

### 14.2 The 30-Minute Heartbeat

Serverless functions cannot run indefinitely. Continuous Mode is implemented via a **recursive scheduling pattern**:

```
User enables Continuous Mode
  → Orchestrator writes a heartbeat_queue record:
     { session_id, next_trigger: NOW() + interval, status: 'pending' }
  → Function terminates

[30 minutes later]
  → Supabase Cron (pg_cron) or Cloud Scheduler fires a webhook
  → Webhook hits: POST /api/swarms/heartbeat?session_id=XXX
  → New Orchestrator invocation boots
  → Reads context from orchestrator_sessions
  → Checks if scheduled time has arrived
  → If yes: dispatches Workers
  → If no: updates next heartbeat timestamp
  → Updates heartbeat_queue record
  → Function terminates

[Repeat]
```

### 14.3 Sovereign Cron — Off-Platform Scheduling

For maximum sovereignty, the heartbeat trigger lives in the **user's own Supabase** (via `pg_cron` extension), not the platform's infrastructure. This means:

- If the platform goes down, the user's heartbeat still fires
- The user's Workers will attempt to execute against the user's Supabase
- The execution will fail gracefully (no platform JWT available) and log an error
- When the platform recovers, the next heartbeat picks up where it left off

This is true sovereignty — the user's automation schedule is not dependent on the platform's uptime.

### 14.4 Zombie Swarm Prevention

A "Zombie Swarm" is a Continuous Mode session that keeps firing after the user has stopped using the platform. Prevention mechanisms:

- Gas Tank depletion automatically suspends Continuous Mode
- User can pause/stop any session from the dashboard
- Sessions automatically expire after 30 days of no user interaction (with warning)
- IP whitelist violations cause immediate session suspension

---

## 15. Scaling Strategy

### 15.1 Target: 10,000+ Concurrent Users

The architecture is designed to scale to tens of thousands of users without linear cost growth. Key enablers:

| Factor | Traditional SaaS | Beautiful Swarms |
|---|---|---|
| Storage cost per user | Platform pays | User pays (own Supabase) |
| Token cost per execution | Platform pays | User pays (BYOK) |
| Idle user cost | High (DB + compute) | ~$0 (stateless) |
| Active user cost | Scales linearly | ~$0.001 per invocation |
| Support cost | High (heterogeneous infra) | Low (standardized Motherboard) |

### 15.2 The SQL Motherboard as the Scaling Catalyst

The key insight: by forcing every user to provision the **identical SQL schema** (the Motherboard), the platform ensures that every Worker function knows exactly where to look for data, regardless of which user it's serving.

There is no "user-specific logic" in the Worker code. The Worker reads `task_results` from the session's Supabase — that's it. The standardization of schema is what makes 10,000 users manageable.

### 15.3 The Integration Tax Problem (and Solution)

**Problem**: If users bring their own Supabase with arbitrary schemas, debugging becomes impossible. Every user's Supabase is different, and the platform's Workers cannot compensate for misconfigured RLS or missing tables.

**Solution**: The Motherboard script is the contract. Before any Worker runs, it can verify the schema:

```sql
SELECT swarms.verify_motherboard_integrity();
-- Returns: { status: 'ok', version: '1.0', missing_tables: [] }
-- If not ok: Orchestrator refuses to dispatch Workers and shows setup guide
```

This turns a potential support nightmare into a self-service verification step.

### 15.4 Cloud Function Cold Start Optimization

- Workers use **pre-warmed containers** for the top 10 Standard Library skills
- JIT skill loading adds ~100-300ms per novel skill (acceptable)
- Orchestrators use **minimum instance counts of 1** to avoid cold start lag for interactive sessions

---

## 16. Design Language — Adaptive Minimalism

### 16.1 Philosophy

The UI must reflect the platform's philosophy: **powerful capabilities hidden behind a simple, clean interface**. The user should never feel overwhelmed. Every advanced feature should feel optional and discoverable.

### 16.2 Visual Identity

**Brand Name**: Beautiful Swarms
**Tagline**: *"Intent to Action. You describe it. Your swarm does it."*

**Design System**:
- **Style**: Adaptive Minimalism (2026/27 trend)
- **Mode**: Dark-first, with system-adaptive light mode
- **Typography**: Inter or Outfit (Google Fonts) — clean, professional
- **Color Palette**: Deep navy background (#0A0E1A), electric teal accent (#00E5CC), neutral grays, soft white text
- **Motion**: Subtle micro-animations — swarm particle effects on task execution, smooth state transitions
- **Texture**: Slight glassmorphism for card surfaces — frosted glass effect over dark background

### 16.3 Core UI Screens

**1. Home / Dashboard**
- Active sessions list (Running / Scheduled / Paused)
- Gas Tank balance indicator
- Recent executions feed (real-time via Supabase subscription)

**2. New Intent**
- Full-width text input — the focal point of the entire product
- Example prompts shown as subtle suggestions
- Model selector (compact, bottom of input)

**3. Plan-Diff-Approve**
- Visual DAG rendered as a clean flowchart
- Each step shows: skill name, credential used (masked), scope, read/write indicator
- "Approve" button is prominent; "Edit" and "Cancel" are secondary

**4. Execution Monitor**
- Real-time Worker progress tracker
- Each Worker shown as a card with status (Booting / Running / Complete / Error)
- Live result preview as Workers complete

**5. Skill Library**
- Marketplace grid — Standard Library skills browsable by category
- Import from GitHub (URL input)
- Upload custom skill

**6. Settings / Infrastructure**
- Supabase connection status
- BYOK key management (shows provider, masked key, expiry)
- Gas Tank top-up (Stripe link)

### 16.4 Interaction Principles

- **No modals** — use inline expansion instead
- **Progressive disclosure** — advanced options are hidden behind "Advanced" toggles
- **Real-time feedback** — all state changes reflected instantly via Supabase real-time
- **One primary action per screen** — reduce cognitive load

---

## 17. Threat Model & Incident Response

### 17.1 Attack Surface Classification

**Tier 1 — Platform Infrastructure** (Medium Value Target)
- Cloud Functions code
- Platform OIDC issuer service
- Git repository

**Tier 2 — User Supabase** (High Value Target, but NOT controlled by platform)
- Contains encrypted secrets (pgsodium)
- Contains task history and audit logs
- Platform has delegated access, not ownership

**Tier 3 — User AI Keys** (Highest Value, Zero-Knowledge)
- Stored as pgsodium-encrypted blobs in user's Supabase
- Platform never holds decrypted values
- Even Supabase admin access yields only ciphertext

### 17.2 Incident Response Playbook

**Scenario: Platform Cloud Function code is compromised**
1. Rotate platform OIDC signing keys → all existing JWTs invalidated globally
2. All Worker invocations fail immediately (can't sign into user Supabase)
3. User data: NOT at risk (platform held no secrets)
4. User impact: Task execution paused until platform recovery
5. Recovery: Redeploy Cloud Functions from clean source, issue new OIDC keys
6. User notification: "Platform maintenance — your scheduled tasks have been paused"

**Scenario: User's Supabase is breached**
1. Attacker gains: Encrypted secret blobs (ciphertext via pgsodium)
2. Attacker cannot gain: Plaintext secrets (HSM key lives in Postgres instance layer)
3. Platform action: Revoke OIDC trust for that user (disable Worker access)
4. User action: Rotate secrets in Supabase Vault, re-establish OIDC trust

**Scenario: Platform OIDC issuer is compromised**
1. Attacker can: Forge platform JWTs for any user
2. With a forged JWT, attacker can: Call `swarms.read_secret()` if they know secret IDs
3. Mitigation: IP whitelist limits JWT acceptance to platform's known IP ranges
4. Secondary mitigation: RLS limits data access to the authenticated user's rows only
5. Emergency response: Disable OIDC integration globally, notify all users to update Supabase Auth config

### 17.3 Security Posture Summary

> "If Beautiful Swarms is hacked, the attacker gets the ability to run your scheduled tasks. They do not get your API keys. They do not get your data. The worst-case scenario is unauthorized computation, not data breach."

This is a fundamentally superior security posture to any platform that stores user credentials centrally.

---

## 18. Roadmap

### Phase 0 — Proof of Concept (Weeks 1–4)

- [ ] Single Cloud Function (GCF) that accepts a text prompt and returns a swarm plan
- [ ] Basic `swarm.yaml` manifest generation
- [ ] Hardcoded single-skill Worker execution (Shopify read)
- [ ] Basic Supabase schema (Motherboard v0)
- [ ] Manual Stripe credit debit
- [ ] Minimal UI: text input → plan display → approve button

**Success metric**: A user can describe "fetch my Shopify orders" and a Worker fetches them.

### Phase 1 — Self-Service MVP (Weeks 5–10)

- [ ] GitHub + Google OAuth login
- [ ] Guided Supabase onboarding (one-click setup)
- [ ] BYOK key management UI (Supabase Vault integration)
- [ ] Plan-Diff-Approve UI
- [ ] Standard Library: 10 Skills (Shopify, Slack, Google Sheets, Gmail, Linear)
- [ ] Gas Tank + Stripe integration
- [ ] Real-time execution monitor
- [ ] Single-execution mode (no scheduling yet)

**Success metric**: A non-technical user can complete onboarding and run their first task in under 5 minutes with no documentation.

### Phase 2 — Scheduling & Continuous Mode (Weeks 11–16)

- [ ] Cron + webhook trigger system
- [ ] Heartbeat protocol (30-minute recursive scheduling)
- [ ] Continuous Mode UI + permission flow
- [ ] Multi-worker parallel dispatch
- [ ] Full Motherboard schema v1.0 + integrity checker
- [ ] BYOS (GitHub skill import + file upload)
- [ ] IP whitelist configuration UI

**Success metric**: Users can set up "every night at 2am" automations that run reliably.

### Phase 3 — Marketplace & Scale (Weeks 17–24)

- [ ] Public skill marketplace (community contributed)
- [ ] Skill static analysis + vetting pipeline
- [ ] OIDC trust establishment UI (guided setup flow)
- [ ] Enterprise tier (custom pricing, dedicated Cloud Function pools)
- [ ] Usage analytics dashboard
- [ ] One-click Supabase Motherboard migration (managed → sovereign)
- [ ] 50+ Standard Library skills

**Success metric**: 1,000 active users, marketplace has 50+ community skills.

### Phase 4 — Enterprise & Ecosystem (Weeks 25+)

- [ ] Enterprise SSO (SAML)
- [ ] Multi-region Cloud Function deployment
- [ ] Audit compliance exports (SOC 2 alignment)
- [ ] Partner API (allow third-party platforms to trigger Beautiful Swarms)
- [ ] "Swarm as a Function" — embeddable execution in third-party apps

---

## 19. Appendix — Key Decisions Log

This section documents the key architectural decisions made during the design session and the rationale behind each.

| Decision | Rationale |
|---|---|
| **BYOK instead of platform-provided AI** | Platform is a router, not an AI provider. Zero token COGS. Users retain model flexibility. |
| **Supabase Vault for secret storage** | Secrets never touch platform storage. pgsodium HSM encryption lives in user's Postgres. Zero-Knowledge posture. |
| **Serverless-only (Cloud Functions/Lambda)** | No idle compute cost. Infinitely scalable. Aligns cost perfectly with usage. Eliminates infrastructure management. |
| **SQL Motherboard as standardized schema** | Prevents "Integration Tax" — all Workers speak the same table structure. Debugging at scale becomes feasible. |
| **KMS-encrypted service_role (not plaintext, not pure OIDC)** | Plaintext static keys are unacceptable. Full OIDC adds onboarding friction and infra complexity. GCP KMS gives hardware-protected encryption with zero-plaintext-at-rest and full audit logging — the best balance of security and simplicity for Phase 1-2. OIDC remains the Phase 3 enterprise upgrade path. |
| **30-minute heartbeat via pg_cron** | Serverless function timeouts (9 min) require external re-triggering. Supabase pg_cron keeps scheduling sovereign. |
| **Plan-Diff-Approve mandatory for writes** | Users don't trust platforms they can't see. Transparency is the product. Reduces "hallucination debt." |
| **Harness Toll (per-execution) not subscription** | Zero idle cost means zero subscription pressure. Only active users pay. 95%+ margin at scale. |
| **GitHub/Google social login only** | No password management. Delegated to best-in-class identity providers. OIDC bridge enables downstream auth. |
| **Skill-as-Markdown (not code)** | Non-technical users can author skills. Platform can sandbox safely. No arbitrary code execution at the skill layer. |
| **Idempotency keys for all Workers** | Heartbeat can fire twice. Double-execution of a Stripe refund or Shopify order update is catastrophic. Must prevent. |
| **Staged auth model (Managed → KMS → OIDC)** | Forces a pragmatic Phase 0 bootstrapping path. Avoids building OIDC infrastructure before product-market fit. Each stage is a security upgrade, not a security downgrade. |

---

*Beautiful Swarms — Master Specification v1.1*
*Authored: March 2026 | Updated: March 2026 — Cloud Function Auth Model (KMS-Encrypted Credential)*
*Philosophy: Stupidly Simple. Stupidly Scalable. Radically Sovereign.*
