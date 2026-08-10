#requires -Version 7
<#
  QCoder Sovereign interactive launcher.
  Opens an interactive Qwen Code session against the FORGE 128K model with:
    - QWEN governance doorway + kernel context (QWEN.md / AGENTS.md / CLAUDE.md)
    - All installed ~/.qwen/skills
    - ECHO memory / forge / queue / vault MCP tools (sovereign-key sourced, never printed)
  Launch in Windows Terminal for full paste support:
    wt.exe -w 0 nt --title "QCoder Sovereign" pwsh -NoLogo -NoExit -File C:\ECHO_MCP\echo-qcoder\launcher\qcoder-sovereign.ps1
#>
[CmdletBinding()]
param(
  [string]$Workspace = 'C:\ECHO_OMEGA_PRIME',
  [string]$Model = 'c3po-code:qcoder-128k'
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$settings = Join-Path $here 'qwen-sovereign-settings.json'
if (-not (Test-Path -LiteralPath $settings)) { throw "Missing sovereign settings: $settings" }

# --- Source the sovereign key into env WITHOUT printing it (MCP servers expand ${ECHO_SOVEREIGN_KEY}) ---
if (-not $env:ECHO_SOVEREIGN_KEY) {
  $keyFile = Join-Path $env:USERPROFILE '.echo_sovereign_key'
  if (Test-Path -LiteralPath $keyFile) {
    $raw = (Get-Content -LiteralPath $keyFile -Raw).Trim()
    if ($raw -match '(?im)^(?:.*SOVEREIGN_KEY\s*=\s*)?(\S+)\s*$') { $env:ECHO_SOVEREIGN_KEY = $Matches[1] }
  }
}
if (-not $env:ECHO_SOVEREIGN_KEY) {
  Write-Warning 'ECHO_SOVEREIGN_KEY unavailable - ECHO memory/forge MCP tools will not authenticate.'
}

$env:QWEN_CODE_SYSTEM_SETTINGS_PATH = $settings
$env:QCODER_LOCAL_API_KEY = 'local-qcoder'
$env:QWEN_CODE_SUPPRESS_YOLO_WARNING = '1'

Set-Location -LiteralPath $Workspace
Write-Host ''
Write-Host '  QCoder Sovereign  ' -ForegroundColor Black -BackgroundColor Cyan -NoNewline
Write-Host "  model=$Model  ctx=131072  workspace=$Workspace" -ForegroundColor Cyan
$skillCount = (Get-ChildItem (Join-Path $env:USERPROFILE '.qwen\skills') -Directory -EA SilentlyContinue).Count
Write-Host "  skills loaded: $skillCount   MCP: echo-memory/queue/sovereign/vault/mega-gateway + serena" -ForegroundColor DarkCyan
Write-Host "  governance: QWEN.md doorway + Sovereign Autonomy Kernel   (paste works here - Ctrl+Shift+V)" -ForegroundColor DarkCyan
Write-Host ''
qwen --model $Model --auth-type openai `
  --openai-base-url 'http://192.168.1.220:11434/v1' `
  --openai-api-key 'local-qcoder' `
  --approval-mode yolo
Write-Host 'qwen session ended.' -ForegroundColor Yellow
