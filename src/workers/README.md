# SimpleClaw - Worker Template

This directory contains the base template for SimpleClaw Workers (Sub-Agents).

## Overview

In the Beautiful Swarms architecture (see `SWARM_SPEC.md`), Workers are ephemeral Cloud Functions that act as the "muscle" of the swarm. Their lifecycle is strictly defined:

1. **Boot:** The function starts (handling CORS and payload extraction).
2. **JIT Skill Loading:** Fetches required skills (currently mocked from a local directory).
3. **KMS Credential Decryption:** Fetches decrypted credentials needed for the task (currently mocked).
4. **Execution:** Delegates to a sub-agent or execution engine.
5. **Termination:** Writes the result to the user's Sovereign Motherboard (currently mocked as a local JSON file) and exits.

This template serves as the foundation for Phase 0 and will be extended in future phases to integrate with actual GCP KMS and Supabase.

## Local Testing

You can run this worker template locally using the Google Cloud Functions Framework.

### 1. Build the Worker

Compile the TypeScript code into Node-compatible JavaScript using Bun:

```bash
bun run build:worker
```
*(This places the output in `dist/workers/index.js`)*

### 2. Start the Worker Locally

Run the local Cloud Functions framework:

```bash
bun run start:worker
```

The function will listen on `http://localhost:8080`.

### 3. Test Invocation

Send a test request using `curl`:

```bash
curl -X POST http://localhost:8080 \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "test-session-123",
    "task": "Test the hello world worker",
    "skills": ["mock-skill"],
    "credentials": ["mock-key"]
  }'
```

### 4. Verify Output

Check the output printed to the terminal and inspect the `mock-supabase-results.json` file in the project root to ensure the mock Sovereign Motherboard recorded the execution result successfully.

## Future Integrations

- **KMS Flow:** The `mockKmsDecrypt` will be replaced with actual GCP Cloud KMS calls to decrypt Supabase `service_role` keys.
- **Sovereign Motherboard:** The `mockWriteToMotherboard` will be replaced with real Supabase RPC calls against the user's provisioned SQL schema.
- **Skills Marketplace:** The `mockLoadSkill` will read `skill_refs` from the user's Supabase or from GitHub URLs.
