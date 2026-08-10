[CmdletBinding()]
param(
    [switch]$Install,
    [ValidateSet('http', 'stdio')]
    [string]$Mode = 'http'
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js is required.' }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw 'npm is required.' }
$nodeMajor = [int]((& node --version).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 24) { throw 'Node.js 24 or newer is required.' }
if ($Install) { & npm ci --ignore-scripts; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
& npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if ($Mode -eq 'stdio') {
    $env:QCODER_TRUSTED_STDIO = '1'
    & node .\server\dist\index.js --stdio
    exit $LASTEXITCODE
}

$required = 'QCODER_OAUTH_INTROSPECTION_URL','QCODER_OAUTH_CLIENT_ID','QCODER_OAUTH_CLIENT_SECRET','QCODER_OAUTH_ALLOWED_CLIENT_IDS'
$missing = @($required | Where-Object { -not [Environment]::GetEnvironmentVariable($_) })
if ($missing.Count -gt 0) { throw "Missing HTTP-mode environment variables: $($missing -join ', ')" }
$hostName = if ($env:HOST) { $env:HOST } else { '127.0.0.1' }
$portNumber = if ($env:PORT) { $env:PORT } else { '8788' }
Write-Host "Starting QCoder MCP at http://${hostName}:${portNumber}/mcp"
& node .\server\dist\index.js
exit $LASTEXITCODE
