[CmdletBinding()]
param([string]$OutputDirectory)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $root 'artifacts' }
$output = [IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $output -Force | Out-Null
& (Join-Path $PSScriptRoot 'verify-plugin.ps1') -SkipMcpSmoke
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$temp = Join-Path $env:TEMP ("echo-qcoder-package-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp -Force | Out-Null
try {
    $excluded = @('.git','node_modules','.runtime','artifacts','.agents','coverage','.env')
    Get-ChildItem -LiteralPath $root -Force | Where-Object { $_.Name -notin $excluded -and $_.Name -notmatch '\.(log|pid)$' } | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination $temp -Recurse -Force
    }
    Get-ChildItem -LiteralPath $temp -Recurse -File | ForEach-Object { $_.LastWriteTimeUtc = [datetime]'2026-08-09T00:00:00Z' }
    $archive = Join-Path $output 'echo-qcoder-console-0.1.0.zip'
    if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
    Compress-Archive -Path (Join-Path $temp '*') -DestinationPath $archive -CompressionLevel Optimal
    $hash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
    $metadata = [ordered]@{ name='echo-qcoder-console'; version='0.1.0'; archive=(Split-Path -Leaf $archive); sha256=$hash; generated_at=(Get-Date).ToUniversalTime().ToString('o') }
    $metadata | ConvertTo-Json | Set-Content -LiteralPath "$archive.json" -Encoding utf8NoBOM
    Write-Host "PACKAGE_OK path=$archive sha256=$hash"
} finally {
    $tempRoot = [IO.Path]::GetFullPath($temp)
    if ($tempRoot.StartsWith([IO.Path]::GetFullPath($env:TEMP), [StringComparison]::OrdinalIgnoreCase)) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}
