[CmdletBinding(SupportsShouldProcess)]
param(
    [ValidateSet('Core', 'Semantic', 'IssueSolver', 'Evaluation')]
    [string[]]$Component = @('Core', 'Semantic', 'IssueSolver', 'Evaluation'),
    [switch]$Force,
    [switch]$SkipSkills
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$manifestPath = Join-Path $root 'config\qcoder-powerpack.json'
$runtimeRoot = Join-Path $root '.runtime\powerpack'
$npmRoot = Join-Path $runtimeRoot 'npm'
$uvCache = Join-Path $runtimeRoot 'uv-cache'
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    throw "QCoder powerpack manifest is missing: $manifestPath"
}
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$repositoryById = @{}
foreach ($entry in $manifest.repositories) {
    $repositoryById[$entry.id] = $entry
}

function Get-PinnedPackage {
    param([Parameter(Mandatory)][string]$Id)
    if (-not $repositoryById.ContainsKey($Id)) {
        throw "Unknown powerpack component repository: $Id"
    }
    $package = [string]$repositoryById[$Id].package
    if (-not $package -or $package -notmatch '(==|@)[0-9]+\.[0-9]+') {
        throw "Powerpack package is not exactly versioned: $Id"
    }
    return $package
}

function Invoke-Checked {
    param(
        [Parameter(Mandatory)][string]$FilePath,
        [Parameter(Mandatory)][string[]]$ArgumentList
    )
    & $FilePath @ArgumentList
    if ($LASTEXITCODE -ne 0) {
        throw "$FilePath failed with exit code $LASTEXITCODE"
    }
}

if (-not (Get-Command node -CommandType Application -ErrorAction SilentlyContinue)) {
    throw 'Node.js is required to validate and install the QCoder powerpack.'
}
Invoke-Checked -FilePath 'node' -ArgumentList @((Join-Path $PSScriptRoot 'validate-powerpack.mjs'))

New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
New-Item -ItemType Directory -Path $uvCache -Force | Out-Null
$priorUvCache = $env:UV_CACHE_DIR
$env:UV_CACHE_DIR = $uvCache
try {
    if ($Component -contains 'Core') {
        if (-not (Get-Command npm -CommandType Application -ErrorAction SilentlyContinue)) {
            throw 'npm is required for the pinned Qwen Code installation.'
        }
        $qwenPackage = Get-PinnedPackage -Id 'qwen-code'
        $expectedQwenVersion = ($qwenPackage -split '@')[-1]
        $qwenCommand = Get-Command qwen -ErrorAction SilentlyContinue | Select-Object -First 1
        $qwenExecutable = if ($qwenCommand) { $qwenCommand.Source } else { $null }
        $installedQwenVersion = if ($qwenExecutable) {
            (& $qwenExecutable --version 2>&1 | Select-Object -First 1).Trim()
        } else {
            $null
        }
        if ($Force -or $installedQwenVersion -ne $expectedQwenVersion) {
            if ($PSCmdlet.ShouldProcess($qwenPackage, 'Install the pinned Qwen Code core')) {
                $npmArgs = @('install', '--global')
                if ($qwenExecutable) {
                    $qwenPrefix = Split-Path -Parent $qwenExecutable
                    if ((Split-Path -Leaf $qwenPrefix) -eq 'bin') { $qwenPrefix = Split-Path -Parent $qwenPrefix }
                    $npmArgs += @('--prefix', $qwenPrefix)
                }
                $npmArgs += @('--save-exact', '--no-audit', '--no-fund', $qwenPackage)
                Invoke-Checked -FilePath 'npm' -ArgumentList $npmArgs
            }
        }
        $qwenCommand = Get-Command qwen -ErrorAction SilentlyContinue | Select-Object -First 1
        if (-not $qwenCommand) { throw 'Qwen Code executable was not found after installation.' }
        $installedQwenVersion = (& $qwenCommand.Source --version 2>&1 | Select-Object -First 1).Trim()
        if ($LASTEXITCODE -ne 0 -or $installedQwenVersion -ne $expectedQwenVersion) {
            throw "Qwen Code version mismatch: expected $expectedQwenVersion, observed $installedQwenVersion"
        }
        Write-Host "QWEN_CODE_OK version=$installedQwenVersion"
    }

    if ($Component -contains 'Semantic') {
        if (-not (Get-Command uv -CommandType Application -ErrorAction SilentlyContinue)) {
            throw 'uv is required for the pinned Serena installation.'
        }
        $serenaPackage = Get-PinnedPackage -Id 'serena'
        if ($PSCmdlet.ShouldProcess($serenaPackage, 'Install semantic MCP tool')) {
            $uvArgs = @('tool', 'install', '-p', '3.13', $serenaPackage)
            if ($Force) { $uvArgs += '--force' }
            Invoke-Checked -FilePath 'uv' -ArgumentList $uvArgs
            Invoke-Checked -FilePath 'serena' -ArgumentList @('--version')
        }

        if (-not (Get-Command npm -CommandType Application -ErrorAction SilentlyContinue)) {
            throw 'npm is required for the pinned ast-grep installation.'
        }
        $astGrepPackage = Get-PinnedPackage -Id 'ast-grep'
        if ($PSCmdlet.ShouldProcess($astGrepPackage, 'Install AST structural search tool')) {
            New-Item -ItemType Directory -Path $npmRoot -Force | Out-Null
            Invoke-Checked -FilePath 'npm' -ArgumentList @(
                'install', '--prefix', $npmRoot, '--save-exact', '--no-audit', '--no-fund', $astGrepPackage
            )
            $astGrep = Join-Path $npmRoot 'node_modules\.bin\ast-grep.cmd'
            Invoke-Checked -FilePath $astGrep -ArgumentList @('--version')
        }
    }

    if ($Component -contains 'IssueSolver') {
        if (-not (Get-Command uv -CommandType Application -ErrorAction SilentlyContinue)) {
            throw 'uv is required for the pinned mini-SWE-agent installation.'
        }
        $issueSolverPackage = Get-PinnedPackage -Id 'mini-swe-agent'
        if ($PSCmdlet.ShouldProcess($issueSolverPackage, 'Install bounded issue-solver reference CLI')) {
            $uvArgs = @('tool', 'install', $issueSolverPackage)
            if ($Force) { $uvArgs += '--force' }
            Invoke-Checked -FilePath 'uv' -ArgumentList $uvArgs
            $toolList = (& uv tool list 2>&1) -join [Environment]::NewLine
            if ($LASTEXITCODE -ne 0 -or $toolList -notmatch 'mini-swe-agent\s+v?2\.4\.6') {
                throw 'mini-SWE-agent installation could not be verified.'
            }
            Write-Host 'MINI_SWE_AGENT_OK version=2.4.6 authority=not-granted'
        }
    }

    if ($Component -contains 'Evaluation') {
        if ($PSCmdlet.ShouldProcess('QCoder golden and powerpack gates', 'Run local evaluation suite')) {
            Invoke-Checked -FilePath 'node' -ArgumentList @((Join-Path $PSScriptRoot 'evaluate-golden.mjs'))
            Invoke-Checked -FilePath 'node' -ArgumentList @((Join-Path $PSScriptRoot 'validate-powerpack.mjs'))
            Write-Host 'QCODER_EVALUATION_OK promptfoo=withheld-high-transitive-audit'
        }
    }
} finally {
    if ($null -eq $priorUvCache) {
        Remove-Item Env:UV_CACHE_DIR -ErrorAction SilentlyContinue
    } else {
        $env:UV_CACHE_DIR = $priorUvCache
    }
}

if (-not $SkipSkills) {
    # These eight directories are QCoder-managed release assets. Refreshing them is
    # required for an idempotent powerpack upgrade and does not touch other skills.
    & (Join-Path $PSScriptRoot 'install-qwen-skills.ps1') -Force
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host "QCODER_POWERPACK_OK components=$($Component -join ',') runtime=$runtimeRoot"
