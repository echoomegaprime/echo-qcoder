[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateNotNullOrEmpty()]
    [string]$Destination
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$destinationPath = [IO.Path]::GetFullPath($Destination)
if ($destinationPath -eq $root -or $root.StartsWith($destinationPath + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'The staging destination must not be the repository root or one of its parents.'
}
if ((Test-Path -LiteralPath $destinationPath) -and @(Get-ChildItem -LiteralPath $destinationPath -Force).Count -gt 0) {
    throw 'The staging destination must be empty.'
}
New-Item -ItemType Directory -Path $destinationPath -Force | Out-Null

$allowlist = @(
    '.agents/plugins/marketplace.json',
    '.codex-plugin',
    '.github',
    '.serena',
    '.env.example',
    '.gitignore',
    '.mcp.json',
    'CHANGELOG.md',
    'config',
    'LICENSE',
    'README.md',
    'SECURITY.md',
    'assets',
    'docs',
    'evals',
    'launcher',
    'package-lock.json',
    'package.json',
    'qwen-skills',
    'scripts',
    'server',
    'skills',
    'web'
)
$blockedSegments = @('.git', '.runtime', '.vite', 'artifacts', 'coverage', 'logs', 'node_modules', '__pycache__')
$blockedExtensions = @('.db', '.log', '.pid', '.pyc', '.pyo', '.sqlite', '.sqlite3', '.tgz', '.zip')

function Test-SafeRelativePath([string]$RelativePath) {
    $segments = $RelativePath -split '[\\/]'
    if (@($segments | Where-Object { $_ -in $blockedSegments }).Count -gt 0) { return $false }
    $leaf = $segments[-1]
    if ($leaf -eq '.env') { return $false }
    if ($leaf -like '.env.*' -and $leaf -ne '.env.example') { return $false }
    if ([IO.Path]::GetExtension($leaf).ToLowerInvariant() -in $blockedExtensions) { return $false }
    return $true
}

foreach ($entry in $allowlist) {
    $source = Join-Path $root $entry
    if (-not (Test-Path -LiteralPath $source)) { throw "Required package path is missing: $entry" }
    $item = Get-Item -LiteralPath $source -Force
    if (-not $item.PSIsContainer) {
        $target = Join-Path $destinationPath $entry
        New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
        Copy-Item -LiteralPath $item.FullName -Destination $target -Force
        continue
    }
    Get-ChildItem -LiteralPath $item.FullName -Recurse -Force -File | ForEach-Object {
        $relative = [IO.Path]::GetRelativePath($root, $_.FullName)
        if (-not (Test-SafeRelativePath $relative)) { return }
        $target = Join-Path $destinationPath $relative
        New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
        Copy-Item -LiteralPath $_.FullName -Destination $target -Force
    }
}

$forbidden = @(Get-ChildItem -LiteralPath $destinationPath -Recurse -Force -File | Where-Object {
    -not (Test-SafeRelativePath ([IO.Path]::GetRelativePath($destinationPath, $_.FullName)))
})
if ($forbidden.Count -gt 0) {
    throw "Unsafe package files escaped the denylist: $($forbidden.FullName -join ', ')"
}

$requiredRuntimePaths = @(
    '.codex-plugin/plugin.json',
    '.mcp.json',
    'launcher/qcoder.ps1',
    'launcher/qcoder_adapter.py',
    'launcher/qwen-plugin-settings.json',
    '.serena/project.yml',
    'config/qcoder-powerpack.json',
    'server/dist/index.js',
    'web/dist/index.html'
)
foreach ($entry in $requiredRuntimePaths) {
    if (-not (Test-Path -LiteralPath (Join-Path $destinationPath $entry))) {
        throw "Required runtime file was not staged: $entry"
    }
}
Write-Host "PLUGIN_STAGE_OK path=$destinationPath"
