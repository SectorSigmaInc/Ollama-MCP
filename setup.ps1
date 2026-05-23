#!/usr/bin/env pwsh
# Bootstrap Ollama-MCP from a clean checkout: install deps, ensure the advisor
# model, register the server with Claude Code (user scope), and smoke-test it.
# Idempotent -- safe to re-run. Run from anywhere: paths resolve off $PSScriptRoot.

$ErrorActionPreference = 'Stop'

$root       = $PSScriptRoot
$server     = Join-Path $root 'server.js'
$testClient = Join-Path $root 'test-client.mjs'
$model      = if ($env:OLLAMA_ADVISOR_MODEL) { $env:OLLAMA_ADVISOR_MODEL } else { 'gemma4:31b' }
$ollamaHost = if ($env:OLLAMA_HOST)          { $env:OLLAMA_HOST }          else { 'http://localhost:11434' }

function Step($n, $msg) { Write-Host "`n=== $n  $msg ===" -ForegroundColor Cyan }
function Pass($msg)     { Write-Host "PASS: $msg"          -ForegroundColor Green }
function Fail($msg)     { Write-Host "FAIL: $msg"          -ForegroundColor Red; exit 1 }

# 1. Dependencies (npm no-ops if already up to date).
Step '1/5' 'npm install'
Push-Location $root
try { npm install } finally { Pop-Location }
if ($LASTEXITCODE -ne 0) { Fail 'npm install failed.' }
Pass 'dependencies installed.'

# 2. Ollama present on PATH and its API reachable.
Step '2/5' 'Ollama runtime'
if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
    Fail 'ollama is not on PATH. Install it from https://ollama.com and re-run.'
}
try {
    Invoke-RestMethod -Uri "$ollamaHost/api/tags" -TimeoutSec 5 | Out-Null
} catch {
    Fail "Ollama API not reachable at $ollamaHost. Make sure Ollama is running, then re-run."
}
Pass "ollama on PATH; API reachable at $ollamaHost."

# 3. Advisor model present; pull loudly if missing (multi-GB download).
Step '3/5' "Advisor model: $model"
$installed = (ollama list) -join "`n"
if ($installed -notmatch [regex]::Escape($model)) {
    Write-Host "Model '$model' is not installed -- pulling now. This is a multi-GB download and may take several minutes." -ForegroundColor Yellow
    ollama pull $model
    if ($LASTEXITCODE -ne 0) { Fail "ollama pull $model failed." }
}
Pass "model '$model' available."

# 4. Register with Claude Code at user scope -- only if not already registered.
Step '4/5' 'Claude Code registration (user scope)'
$freshlyRegistered = $false
if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
    Write-Host "WARN: 'claude' CLI not on PATH -- skipping registration. Register later with:" -ForegroundColor Yellow
    Write-Host "      claude mcp add ollama -s user -- node `"$server`"" -ForegroundColor Yellow
} else {
    & claude mcp get ollama *> $null
    if ($LASTEXITCODE -ne 0) {
        & claude mcp add ollama -s user -- node $server
        if ($LASTEXITCODE -ne 0) { Fail 'claude mcp add failed.' }
        $freshlyRegistered = $true
        Pass "registered 'ollama' at user scope -> node $server"
    } else {
        Pass "'ollama' already registered at user scope (left as-is)."
    }
}

# 5. End-to-end smoke test (spawns the server itself; independent of Claude Code).
# test-client.mjs exits 0 even when the tool returns isError:true, so assert on
# its output (IS_ERROR: false) -- not just the exit code -- to avoid a false PASS.
Step '5/5' 'Smoke test (node test-client.mjs)'
$smoke = & node $testClient 2>&1
$smoke | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -ne 0) { Fail 'smoke test crashed -- see output above.' }
if (($smoke -join "`n") -notmatch 'IS_ERROR: false') {
    Fail 'smoke test reached the server but the advisor returned an error (IS_ERROR not false) -- see output above.'
}
Pass 'smoke test passed.'

Write-Host "`nOllama-MCP is live." -ForegroundColor Green
if ($freshlyRegistered) {
    Write-Host "NOTE: the server was just registered. Restart Claude Code so it loads 'ollama' and exposes the mcp__ollama__consult tool." -ForegroundColor Yellow
}
