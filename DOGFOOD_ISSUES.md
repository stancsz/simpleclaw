# Dogfood Testing Issues

The following 11 test cases were found to fail 100% of the time during the dogfood testing cycle. These have been flagged for resolution via GitHub issues.

## Failed Tests

1. `GitHub plugin > plugin validates required parameters`
2. `End-to-End Integration: Worker Dispatch and Execution Loop > should parse intent, dispatch worker, fetch demo-skill, decrypt credential, and log results`
3. `KeyManager Component > validates OpenAI key format`
4. `KeyManager Component > validates Anthropic key format`
5. `KeyManager Component > submits successfully with valid key`
6. `Comprehensive Orchestration Flow Integration Test > should successfully execute a simple single-worker flow` (Test #1)
7. `Comprehensive Orchestration Flow Integration Test > should successfully execute a simple single-worker flow` (Test #2)
8. `End-to-End Swarm Orchestration Loop > should complete the full swarm orchestration loop`
9. `Swarm End-to-End Integration Pipeline > should successfully execute orchestrator -> worker -> motherboard pipeline`
10. `Orchestrator Cloud Function (Real LLM) > handles missing API key gracefully`
11. `LLM parser configuration > throws an error when no API key is set`

## Recommended Action
Please investigate and resolve each of these deterministic test failures to restore system stability.
