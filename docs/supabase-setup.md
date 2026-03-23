# Beautiful Swarms - Sovereign Motherboard Supabase Setup Guide

This guide covers setting up your own Sovereign Motherboard using Supabase, transitioning you from local SQLite development into a fully verified execution environment as defined in SWARM_SPEC.md.

## 1. Provision a Supabase Project

To use Beautiful Swarms in Sovereign mode, you need your own Supabase project.

1. Go to [Supabase](https://supabase.com) and create an account or sign in.
2. Click **"New Project"**.
3. Select an organization, name your project (e.g., `beautiful-swarms-motherboard`), and generate a strong database password.
4. Choose the region closest to where your functions will run.
5. Click **"Create new project"**. Wait a few minutes for the database to provision.

## 2. Obtain Your Credentials

You will need the Project URL and the `service_role` key to give the orchestration layer access.

1. In your Supabase Dashboard, go to **Project Settings** (gear icon) -> **API**.
2. Copy the **Project URL**.
3. Under Project API keys, reveal and copy the `service_role` key.

> ⚠️ **SECURITY WARNING**: The `service_role` key bypasses all Row Level Security (RLS) policies. **Never** expose this key in your frontend code or public repositories. Beautiful Swarms uses KMS encryption to protect this key at rest and only decrypts it in ephemeral memory during worker execution.

## 3. Configure Your Environment

In the root of the SimpleClaw repository, copy the `.env.example` file to `.env` if you haven't already:

```bash
cp .env.example .env
```

Add your Supabase credentials:

```env
SUPABASE_URL="https://your-project-id.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
```

The presence of `SUPABASE_URL` automatically switches `DBClient` from SQLite to Supabase mode.

## 4. Run the Migration Tool

The SQL Motherboard schema creates the required tables (like `vault.user_secrets`, `orchestrator_sessions`, `task_results`) and installs the integrity checks.

Run the migration script:

```bash
bun run scripts/migrate-to-supabase.ts
```

If direct SQL execution via RPC is not available in your project, the tool will output the exact SQL you need to run.

### Running SQL manually:
1. Go to your Supabase Dashboard -> **SQL Editor**.
2. Click **"New query"**.
3. Paste the SQL output from the migration tool.
4. Click **"Run"**.

After applying the schema, run the migration script again. You should see a success message:
`✅ Integrity check passed: { status: 'ok', version: '1.0', missing_tables: [] }`

## 5. Security Best Practices

* **Rotate Keys Regularly:** If you believe your `service_role` key has been exposed, roll it immediately in the Supabase API Settings.
* **IP Whitelisting:** For production use, consider using Supabase Network Restrictions to only allow connections from known Beautiful Swarm Cloud Function IP ranges.
* **OIDC Future Path:** As outlined in SWARM_SPEC.md Phase 3+, we will eventually transition from `service_role` keys to short-lived JWTs via OIDC trust establishment for true zero-knowledge orchestration.

## Troubleshooting

**Q: The migration tool fails to connect.**
Ensure your `SUPABASE_URL` is formatted correctly (e.g., `https://xxxx.supabase.co`) and that your `SUPABASE_SERVICE_ROLE_KEY` is exact, with no trailing spaces.

**Q: The integrity check fails after running the SQL.**
Make sure you ran the entire script in the SQL Editor. The `swarms.verify_motherboard_integrity` function checks for tables in both the `public` and `vault` schemas. Ensure you have the Supabase Vault extension enabled (it usually is by default, but you can check in **Database** -> **Extensions**).

**Q: Workers are failing to fetch task results.**
Check the `audit_log` table in your Supabase dashboard. It provides granular insights into worker dispatch events and secret accesses.
