[CmdletBinding()]
param([switch]$Install, [switch]$SkipMcpSmoke)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js is required.' }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw 'npm is required.' }
if ($Install) {
    & npm ci --ignore-scripts; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & npm ci --prefix .\scripts\inspector --ignore-scripts; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
Get-ChildItem -LiteralPath $root -Recurse -File -Include *.json | Where-Object { $_.FullName -notmatch '[\\/]node_modules[\\/]|[\\/]dist[\\/]|[\\/]artifacts[\\/]|[\\/]\.runtime[\\/]|[\\/]\.agents[\\/]plugins[\\/]plugins[\\/]' } | ForEach-Object {
    Get-Content -LiteralPath $_.FullName -Raw | ConvertFrom-Json -AsHashtable | Out-Null
}
& npm run typecheck; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& npm run lint; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& npm run format:check; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& npm test; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& npm run build; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& node .\scripts\validate-plugin.mjs; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& node .\scripts\validate-powerpack.mjs; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& python .\launcher\tests\test_qcoder_adapter.py; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& npm audit --audit-level=high; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& npm audit --prefix .\scripts\inspector --audit-level=high; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$secretPattern = '(?i)(sk-[a-z0-9_-]{20,}|gh[pousr]_[a-z0-9_]{20,}|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----)'
$secretHits = @(Get-ChildItem -LiteralPath $root -Recurse -File | Where-Object { $_.FullName -notmatch '[\\/]node_modules[\\/]|[\\/]dist[\\/]|[\\/]\.git[\\/]|[\\/]artifacts[\\/]|[\\/]\.runtime[\\/]|[\\/]\.agents[\\/]plugins[\\/]plugins[\\/]' } | Select-String -Pattern $secretPattern)
if ($secretHits.Count -gt 0) { throw "Secret scan found $($secretHits.Count) candidate values." }
& (Join-Path $PSScriptRoot 'install-local-marketplace.ps1'); if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
if (-not $SkipMcpSmoke) { & (Join-Path $PSScriptRoot 'test-mcp.ps1') -SkipBuild; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
Write-Host 'VERIFY_PLUGIN_OK static=pass types=pass lint=pass tests=pass build=pass audit=pass secrets=pass'

