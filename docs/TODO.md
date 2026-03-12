# SimpleClaw Core TODO: Agentic CLI Support

To fully support a rich, interactive CLI equivalent to Claude Code or Gemini CLI, the `src/` core needs the following modifications and enhancements:

## 1. Streaming Inference API
*   **Current State:** The core executor (`src/core/executor.ts`) executes tools synchronously or via simple async wrappers without yielding partial results. There is no actual LLM integration.
*   **Required Change:** Introduce an inference module (e.g., `src/core/llm.ts`) that streams tokens back to the caller. This will allow the CLI to render words in real-time as the agent "speaks".

## 2. Dynamic Tool Discovery
*   **Current State:** The `extensionRegistry` supports registering capabilities, but there isn't a native way to cleanly expose a JSON Schema list of all available tools to an LLM.
*   **Required Change:** Add an `exportSchema()` or similar method to `src/core/extensions.ts` so the CLI can bind tools dynamically into the LLM system prompt.

## 3. Persistent Conversation State
*   **Current State:** Execution is strictly stateless (or reliant on simple webhook request-response lifecycles).
*   **Required Change:** Introduce a `src/core/memory.ts` module to handle context window management, sliding message histories, and persistent session states across REPL inputs.

## 4. Agentic Loop (Plan/Act/Reflect)
*   **Current State:** Tools are invoked linearly either via a webhook or a direct CLI slash command.
*   **Required Change:** Create an orchestration loop inside the core that allows the agent to decide to call a tool, ingest the tool's output, and continue reasoning before eventually responding to the user.
