[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidatePattern('^plugin_asdk_app_[A-Za-z0-9_-]+$')]
    [string]$AppId,
    [switch]$Force
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$appPath = Join-Path $root '.app.json'
$manifestPath = Join-Path $root '.codex-plugin\plugin.json'
if (Test-Path -LiteralPath $appPath) {
    $existing = Get-Content -LiteralPath $appPath -Raw | ConvertFrom-Json
    $existingId = $existing.apps.'echo-qcoder-console'.id
    if ($existingId -eq $AppId) { Write-Host 'The requested QCoder app ID is already configured.'; exit 0 }
    if (-not $Force) { throw 'A different valid .app.json already exists. Use -Force to replace it.' }
}
$app = [ordered]@{ apps = [ordered]@{ 'echo-qcoder-console' = [ordered]@{ id = $AppId; category = 'Developer Tools' } } }
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json -AsHashtable
$manifest['apps'] = './.app.json'
$tempApp = "$appPath.$([guid]::NewGuid().ToString('N')).tmp"
$tempManifest = "$manifestPath.$([guid]::NewGuid().ToString('N')).tmp"
try {
    $app | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $tempApp -Encoding utf8NoBOM
    $manifest | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $tempManifest -Encoding utf8NoBOM
    Get-Content -LiteralPath $tempApp -Raw | ConvertFrom-Json | Out-Null
    Get-Content -LiteralPath $tempManifest -Raw | ConvertFrom-Json | Out-Null
    Move-Item -LiteralPath $tempApp -Destination $appPath -Force
    Move-Item -LiteralPath $tempManifest -Destination $manifestPath -Force
    Write-Host "Configured the verified ChatGPT app ID in $appPath"
} finally {
    Remove-Item -LiteralPath $tempApp,$tempManifest -Force -ErrorAction SilentlyContinue
}
