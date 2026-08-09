[CmdletBinding()]
param([switch]$Register)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$marketRoot = Join-Path $root '.agents\plugins'
$target = Join-Path $marketRoot 'plugins\echo-qcoder-console'
$resolvedParent = [IO.Path]::GetFullPath((Split-Path -Parent $target))
$allowedParent = [IO.Path]::GetFullPath((Join-Path $marketRoot 'plugins'))
if ($resolvedParent -ne $allowedParent) { throw 'Marketplace target escaped the controlled staging directory.' }
if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
New-Item -ItemType Directory -Path $target -Force | Out-Null
$excluded = @('.git','node_modules','.runtime','artifacts','.agents')
Get-ChildItem -LiteralPath $root -Force | Where-Object { $_.Name -notin $excluded } | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $target -Recurse -Force
}
& node (Join-Path $target 'scripts\validate-plugin.mjs')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
if ($Register) {
    if (-not (Get-Command codex -ErrorAction SilentlyContinue)) { throw 'Codex CLI is required for marketplace registration.' }
    & codex plugin marketplace add $marketRoot
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & codex plugin add 'echo-qcoder-console@echo-qcoder-local'
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    Write-Host 'Restart or refresh Codex to load QCoder Console.'
} else {
    Write-Host "Staged validated local plugin at $target"
}
