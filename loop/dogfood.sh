#!/bin/bash
# dogfood.sh — SimpleClaw self-improvement loop
# Uses opencode + DeepSeek to continuously improve SimpleClaw itself.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.." || exit 1

# Load .env so DEEPSEEK_API_KEY etc. are available
if [[ -f ".env" ]]; then
  set -o allexport
  # shellcheck disable=SC1091
  source .env
  set +o allexport
fi

OPENCODE_MODEL="${OPENCODE_MODEL:-deepseek/deepseek-chat}"
RUN_HOURS="${RUN_HOURS:-4}"
SLEEP_SECONDS="${DOGFOOD_SLEEP_SECONDS:-10}"
RUN_ONCE="${DOGFOOD_ONCE:-0}"
MAX_CONSECUTIVE_FAILURES="${DOGFOOD_MAX_CONSECUTIVE_FAILURES:-3}"

# Map OPENAI_API_KEY (set in .env for DeepSeek) to DEEPSEEK_API_KEY
if [[ -z "${DEEPSEEK_API_KEY:-}" && -n "${OPENAI_API_KEY:-}" ]]; then
  export DEEPSEEK_API_KEY="$OPENAI_API_KEY"
fi

log() {
  echo "--- [$(date +%T)] $* ---"
}

require_file() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    echo "Missing required file: $file" >&2
    exit 1
  fi
}

ensure_opencode_ready() {
  if ! command -v opencode >/dev/null 2>&1; then
    echo "opencode CLI not found. Install with: npm install -g opencode-ai" >&2
    exit 1
  fi
  if [[ -z "${DEEPSEEK_API_KEY:-}" ]]; then
    echo "DEEPSEEK_API_KEY is not set. Add OPENAI_API_KEY or DEEPSEEK_API_KEY to .env" >&2
    exit 1
  fi
}

run_opencode() {
  opencode run \
    --model "$OPENCODE_MODEL" \
    "$@"
}

restore_claude_md() {
  if git ls-files --error-unmatch CLAUDE.md >/dev/null 2>&1; then
    git checkout -- CLAUDE.md
  fi
}

require_file "CLAUDE.md"
require_file "SPEC.md"
ensure_opencode_ready

RUN_SECONDS="$(awk -v hours="$RUN_HOURS" 'BEGIN {
  if (hours !~ /^[0-9]+([.][0-9]+)?$/) { exit 1 }
  printf "%d", hours * 3600
}')"
if [[ -z "$RUN_SECONDS" || "$RUN_SECONDS" -le 0 ]]; then
  echo "RUN_HOURS must be a positive number" >&2
  exit 1
fi

END_TIME_EPOCH=$(( $(date +%s) + RUN_SECONDS ))
consecutive_failures=0
cycle=0

while (( $(date +%s) < END_TIME_EPOCH )); do
  cycle=$((cycle + 1))
  log "Dogfood Cycle #${cycle} — SimpleClaw improving itself"

  run_opencode "You are dogfooding SimpleClaw — an autonomous agent workstation.
Your job is to improve SimpleClaw's own codebase in one focused cycle.

STEP 1 — Orient:
  - Read CLAUDE.md to understand the current task state and backlog.
  - Read SPEC.md to understand the product vision and architecture.
  - Read .agents/comm/OUTBOX.md to check for any human-assigned tasks (prioritize those).

STEP 2 — Pick the highest-leverage move:
  - From the backlog or your own analysis, identify ONE concrete improvement to make.
  - Good candidates: fixing a bug, adding a missing feature, improving reliability,
    adding a test, cleaning up a skill, or improving agent infrastructure.
  - Favor changes that make SimpleClaw more autonomous, reliable, or capable.

STEP 3 — Implement it:
  - Make the change. Be surgical and focused — touch only what's needed.
  - If the change requires tests, write and run them.
  - Verify your change works before finishing.

STEP 4 — Document:
  - Update CLAUDE.md: mark completed backlog items, add new discoveries.
  - If you learned something useful, append a dated entry to .agents/memory/memory.md.
  - Write a one-line summary of what you did to .agents/comm/INBOX.md.

STEP 5 — Exit cleanly.
  Do not open a TUI. Do not spin loops. Exit after completing one improvement."

  status=$?

  if [[ $status -ne 0 ]]; then
    consecutive_failures=$((consecutive_failures + 1))
    log "Cycle #${cycle} failed (exit $status) — consecutive failures: $consecutive_failures"
    if [[ $consecutive_failures -ge $MAX_CONSECUTIVE_FAILURES ]]; then
      echo "Stopping after $consecutive_failures consecutive failures." >&2
      exit "$status"
    fi
  else
    consecutive_failures=0
    log "Cycle #${cycle} complete ✓"
  fi

  restore_claude_md

  if [[ "$RUN_ONCE" == "1" ]]; then
    break
  fi

  if (( $(date +%s) >= END_TIME_EPOCH )); then
    log "Run window of ${RUN_HOURS} hour(s) reached"
    break
  fi

  sleep "$SLEEP_SECONDS"
done

log "Dogfood session ended after ${cycle} cycle(s)"