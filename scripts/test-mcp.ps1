[CmdletBinding()]
param(
    [switch]$SkipBuild,
    [switch]$Inspector,
    [ValidateRange(1024,65535)]
    [int]$Port = 8789
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js is required.' }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw 'npm is required.' }
if (-not $SkipBuild) { & npm run build; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }

$testRuntime = Join-Path $env:TEMP ("echo-qcoder-mcp-smoke-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRuntime -Force | Out-Null
$stdout = Join-Path $testRuntime 'server.stdout.log'
$stderr = Join-Path $testRuntime 'server.stderr.log'
$prior = @{}
foreach ($name in 'HOST','PORT','QCODER_DATA_DIR','QCODER_OAUTH_INTROSPECTION_URL','QCODER_OAUTH_CLIENT_ID','QCODER_OAUTH_CLIENT_SECRET','QCODER_OAUTH_ALLOWED_CLIENT_IDS') {
    $prior[$name] = [Environment]::GetEnvironmentVariable($name)
}
$process = $null
try {
    $env:HOST = '127.0.0.1'
    $env:PORT = [string]$Port
    $env:QCODER_DATA_DIR = Join-Path $testRuntime 'data'
    $env:QCODER_OAUTH_INTROSPECTION_URL = 'https://127.0.0.1:65534/introspect'
    $env:QCODER_OAUTH_CLIENT_ID = 'qcoder-local-protocol-test'
    $env:QCODER_OAUTH_CLIENT_SECRET = 'local-test-value-not-a-credential'
    $env:QCODER_OAUTH_ALLOWED_CLIENT_IDS = 'chatgpt-qcoder'
    $process = Start-Process -FilePath (Get-Command node).Source -ArgumentList '.\server\dist\index.js' -WorkingDirectory $root -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    $healthy = $false
    for ($attempt = 0; $attempt -lt 50; $attempt++) {
        if ($process.HasExited) { throw "QCoder MCP exited early. See $stderr" }
        try {
            $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/healthz" -TimeoutSec 2
            if ($health.status -eq 'ok') { $healthy = $true; break }
        } catch { Start-Sleep -Milliseconds 200 }
    }
    if (-not $healthy) { throw 'QCoder MCP health endpoint did not become ready.' }
    $ready = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/readyz" -TimeoutSec 3
    $version = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/version" -TimeoutSec 3
    if ($ready.status -ne 'ready' -or $version.name -ne 'echo-qcoder-console') { throw 'QCoder MCP readiness/version contract failed.' }
    & node .\scripts\mcp-smoke.mjs "http://127.0.0.1:$Port/mcp"
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    if ($Inspector) {
        $inspectorCommand = Join-Path $root 'scripts\inspector\node_modules\.bin\mcp-inspector.cmd'
        if (-not (Test-Path -LiteralPath $inspectorCommand)) {
            throw 'Locked MCP Inspector dependency is not installed. Run npm ci --prefix scripts/inspector.'
        }
        & $inspectorCommand --cli "http://127.0.0.1:$Port/mcp" --method tools/list
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
    Write-Host "QCODER_MCP_SMOKE_OK health=ok ready=ready version=$($version.version)"
} finally {
    if ($process -and -not $process.HasExited) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue }
    foreach ($name in $prior.Keys) { [Environment]::SetEnvironmentVariable($name, $prior[$name]) }
    Write-Host "Smoke logs: $testRuntime"
}
