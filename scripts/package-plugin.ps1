[CmdletBinding()]
param([string]$OutputDirectory)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $root 'artifacts' }
$output = [IO.Path]::GetFullPath($OutputDirectory)
$manifest = Get-Content -LiteralPath (Join-Path $root '.codex-plugin\plugin.json') -Raw | ConvertFrom-Json
$version = [string]$manifest.version
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Plugin manifest version must use strict semantic versioning.' }
New-Item -ItemType Directory -Path $output -Force | Out-Null
& (Join-Path $PSScriptRoot 'verify-plugin.ps1') -SkipMcpSmoke
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$temp = Join-Path $env:TEMP ("echo-qcoder-package-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp -Force | Out-Null
$validationTemp = Join-Path $env:TEMP ("echo-qcoder-package-validation-" + [guid]::NewGuid().ToString('N'))
try {
    & (Join-Path $PSScriptRoot 'stage-plugin.ps1') -Destination $temp
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    Get-ChildItem -LiteralPath $temp -Recurse -File | ForEach-Object { $_.LastWriteTimeUtc = [datetime]'2026-08-09T00:00:00Z' }
    $archive = Join-Path $output "echo-qcoder-console-$version.zip"
    if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [IO.Compression.ZipFile]::CreateFromDirectory($temp, $archive, [IO.Compression.CompressionLevel]::Optimal, $false)
    New-Item -ItemType Directory -Path $validationTemp -Force | Out-Null
    [IO.Compression.ZipFile]::ExtractToDirectory($archive, $validationTemp)
    & node (Join-Path $validationTemp 'scripts\validate-plugin.mjs') --archive
    if ($LASTEXITCODE -ne 0) { throw 'Packaged plugin contract validation failed.' }
    & node (Join-Path $root 'scripts\staged-mcp-smoke.mjs') --plugin-root $validationTemp
    if ($LASTEXITCODE -ne 0) { throw 'Packaged plugin MCP runtime smoke failed.' }
    $forbidden = @(Get-ChildItem -LiteralPath $validationTemp -Recurse -Force | Where-Object {
        $_.FullName -match '[\\/](node_modules|__pycache__|coverage|\.runtime|artifacts|logs)([\\/]|$)' -or
        $_.Name -match '\.(pyc|pyo|log|pid|sqlite3?|db)$'
    })
    if ($forbidden.Count -gt 0) { throw "Package contains forbidden paths: $($forbidden.FullName -join ', ')" }
    $hash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
    $metadata = [ordered]@{ name='echo-qcoder-console'; version=$version; archive=(Split-Path -Leaf $archive); sha256=$hash; generated_at=(Get-Date).ToUniversalTime().ToString('o') }
    $metadata | ConvertTo-Json | Set-Content -LiteralPath "$archive.json" -Encoding utf8NoBOM
    Write-Host "PACKAGE_OK path=$archive sha256=$hash"
} finally {
    $tempRoot = [IO.Path]::GetFullPath($temp)
    if ($tempRoot.StartsWith([IO.Path]::GetFullPath($env:TEMP), [StringComparison]::OrdinalIgnoreCase)) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
    $validationRoot = [IO.Path]::GetFullPath($validationTemp)
    if ($validationRoot.StartsWith([IO.Path]::GetFullPath($env:TEMP), [StringComparison]::OrdinalIgnoreCase)) {
        Remove-Item -LiteralPath $validationRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}
