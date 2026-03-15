# dogfood.ps1 - SimpleClaw self-improvement loop (PowerShell)
# Uses opencode + DeepSeek to continuously improve SimpleClaw itself.

param(
    [string]$Model      = "",
    [double]$RunHours   = 0,
    [int]$SleepSeconds  = 0,
    [switch]$Once       # Pass -Once to run a single cycle and exit (also respects DOGFOOD_ONCE=1)
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location (Split-Path -Parent $ScriptDir)

# --- Load .env (always override -- matches `set -o allexport; source .env` behavior) ---
if (Test-Path ".env") {
    Get-Content ".env" | Where-Object { $_ -match "^\s*[^#]" -and $_ -match "=" } | ForEach-Object {
        $kv = $_ -split "=", 2
        $key = $kv[0].Trim()
        $val = ($kv[1] -replace "\s*#.*$", "").Trim().Trim('"').Trim("'")
        [Environment]::SetEnvironmentVariable($key, $val, "Process")
    }
}

# --- Set Default Values ---
if ([string]::IsNullOrEmpty($Model)) {
    if ($env:OPENCODE_MODEL) { $Model = $env:OPENCODE_MODEL } else { $Model = "deepseek/deepseek-chat" }
}
if ($RunHours -eq 0) {
    if ($env:RUN_HOURS) { $RunHours = [double]$env:RUN_HOURS } else { $RunHours = 4.0 }
}
if ($SleepSeconds -eq 0) {
    if ($env:DOGFOOD_SLEEP_SECONDS) { $SleepSeconds = [int]$env:DOGFOOD_SLEEP_SECONDS } else { $SleepSeconds = 10 }
}

# DOGFOOD_ONCE=1 env var support (mirrors shell script)
if (-not $Once -and $env:DOGFOOD_ONCE -eq "1") {
    $Once = $true
}

if ($env:DOGFOOD_MAX_CONSECUTIVE_FAILURES) { $MaxFailures = [int]$env:DOGFOOD_MAX_CONSECUTIVE_FAILURES } else { $MaxFailures = 3 }

# Map OPENAI_API_KEY -> DEEPSEEK_API_KEY if needed
if (-not $env:DEEPSEEK_API_KEY -and $env:OPENAI_API_KEY) {
    $env:DEEPSEEK_API_KEY = $env:OPENAI_API_KEY
}

# --- Preflight checks ---
if (-not (Get-Command opencode -ErrorAction SilentlyContinue)) {
    Write-Error "opencode CLI not found. Install with: npm install -g opencode-ai"
    exit 1
}
if (-not $env:DEEPSEEK_API_KEY) {
    Write-Error "DEEPSEEK_API_KEY is not set. Add OPENAI_API_KEY or DEEPSEEK_API_KEY to .env"
    exit 1
}
foreach ($f in @("CLAUDE.md", "SPEC.md")) {
    if (-not (Test-Path $f)) {
        Write-Error "Missing required file: $f"
        exit 1
    }
}

function Log($msg) {
    Write-Host "--- [$([datetime]::Now.ToString('HH:mm:ss'))] $msg ---"
}

function Update-AgentWorkspace($CycleNum, $Status) {
    $claudePath = "CLAUDE.md"
    if (-not (Test-Path $claudePath)) { return }

    $timestamp = [datetime]::Now.ToString("yyyy-MM-dd HH:mm")
    $statusIcon = if ($Status -eq 0) { "✅" } else { "❌ (exit $Status)" }
    $entry = "- [$timestamp] Cycle #$CycleNum $statusIcon"

    $content = Get-Content $claudePath -Raw
    $marker = "# AGENT WORKSPACE (MODIFIABLE BY AGENT)"

    if ($content -match [regex]::Escape($marker)) {
        # Insert the new entry on the line immediately after the section header
        $updated = $content -replace "(?m)^(# AGENT WORKSPACE \(MODIFIABLE BY AGENT\)[ \t]*)\r?\n", "`$1`n$entry`n"
        Set-Content $claudePath $updated -NoNewline
    } else {
        # Marker missing — append section at end as a fallback
        Add-Content $claudePath "`n$marker`n$entry"
    }
}

$Prompt = (
    "You are dogfooding SimpleClaw - an autonomous agent workstation.`n" +
    "Your job is to improve SimpleClaw's own codebase in one focused cycle.`n" +
    "`n" +
    "STEP 1 - Orient:`n" +
    "  - Read CLAUDE.md to understand the current task state and backlog.`n" +
    "  - Read SPEC.md to understand the product vision and architecture.`n" +
    "  - Read .agents/comm/OUTBOX.md to check for any human-assigned tasks (prioritize those).`n" +
    "`n" +
    "STEP 2 - Pick the highest-leverage move:`n" +
    "  - From the backlog or your own analysis, identify ONE concrete improvement to make.`n" +
    "  - Good candidates: fixing a bug, adding a missing feature, improving reliability,`n" +
    "    adding a test, cleaning up a skill, or improving agent infrastructure.`n" +
    "  - Favor changes that make SimpleClaw more autonomous, reliable, or capable.`n" +
    "`n" +
    "STEP 3 - Implement it:`n" +
    "  - Make the change. Be surgical and focused -- touch only what's needed.`n" +
    "  - If the change requires tests, write and run them.`n" +
    "  - Verify your change works before finishing.`n" +
    "`n" +
    "STEP 4 - Document:`n" +
    "  - Update CLAUDE.md: mark completed backlog items, add new discoveries.`n" +
    "  - If you learned something useful, append a dated entry to .agents/memory/memory.md.`n" +
    "  - Write a one-line summary of what you did to .agents/comm/INBOX.md.`n" +
    "`n" +
    "STEP 5 - Exit cleanly.`n" +
    "  Do not open a TUI. Do not spin loops. Exit after completing one improvement."
)

$RunSeconds = [int]($RunHours * 3600)
$EndEpoch   = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() + $RunSeconds
$Failures   = 0
$Cycle      = 0

while ([DateTimeOffset]::UtcNow.ToUnixTimeSeconds() -lt $EndEpoch) {
    $Cycle++
    Log "Dogfood Cycle #$Cycle - SimpleClaw improving itself"

    # Run opencode directly via call operator -- inherits console stdio (live output)
    # opencode is a .ps1 npm shim, so Start-Process won't work; & handles all shim types
    & opencode run --model $Model $Prompt
    $status = $LASTEXITCODE

    if ($status -ne 0) {
        $Failures++
        Log "Cycle #$Cycle failed (exit $status) - consecutive failures: $Failures"
        if ($Failures -ge $MaxFailures) {
            Write-Error "Stopping after $Failures consecutive failures."
            exit $status
        }
    } else {
        $Failures = 0
        Log "Cycle #$Cycle complete"
    }

    Update-AgentWorkspace $Cycle $status

    if ($Once) { break }

    if ([DateTimeOffset]::UtcNow.ToUnixTimeSeconds() -ge $EndEpoch) {
        Log "Run window of $RunHours hour(s) reached"
        break
    }

    Start-Sleep -Seconds $SleepSeconds
}

Log "Dogfood session ended after $Cycle cycle(s)"
