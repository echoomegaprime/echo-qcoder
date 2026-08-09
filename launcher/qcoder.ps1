[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$Role,
    [string]$WorkerId,
    [string]$ResumeSession,
    [string]$Mission,
    [switch]$Continue,
    [switch]$New,
    [switch]$Loop,
    [switch]$Queue,
    [switch]$Headless,
    [switch]$UntilDone,
    [switch]$Safe,
    [switch]$NoHydrate,
    [switch]$NoSearch,
    [switch]$NoControl,
    [switch]$NoGpuLease,
    [switch]$DryRun,
    [ValidateRange(1, 6)]
    [int]$Swarm = 1,
    [ValidateSet('none', 'standard', 'strict')]
    [string]$Verify = 'strict',
    [ValidateRange(1024, 65535)]
    [int]$ControlPort = 8977,
    [string]$RunId,
    [ValidateRange(0, 100)]
    [int]$MaxRestarts = 8,
    [ValidateRange(1, 300)]
    [int]$RestartDelaySeconds = 15,
    [ValidateRange(180, 43200)]
    [int]$LeaseTtlSeconds = 900,
    [string]$ProjectDir = (Get-Location).Path,
    [Parameter(ValueFromRemainingArguments)]
    [string[]]$AdditionalArguments
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$adapterPath = Join-Path $PSScriptRoot 'qcoder_adapter.py'
$codexAutoPath = 'C:\ECHO_OMEGA_PRIME\SYSTEMS\codex_auto\codex-auto.ps1'
$governanceRoot = 'C:\ECHO_OMEGA_PRIME'
$leaseController = '/usr/local/sbin/qcoder-gpu-lease'

function Invoke-QcoderGpuLease {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [ValidateSet('acquire', 'renew', 'release')]
        [string]$Action,
        [Parameter(Mandatory)]
        [string]$Token,
        [string]$Holder,
        [int]$Ttl
    )

    $remote = @('forge', 'sudo', $leaseController, $Action, '--token', $Token)
    if ($Action -eq 'acquire') {
        $remote += @('--holder', $Holder, '--ttl', [string]$Ttl)
    } elseif ($Action -eq 'renew') {
        $remote += @('--ttl', [string]$Ttl)
    }
    $result = & ssh @remote 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "QCoder GPU lease $Action failed: $($result -join ' ')"
    }
    return ($result -join [Environment]::NewLine)
}

foreach ($requiredPath in @($adapterPath, $codexAutoPath)) {
    if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
        throw "Required QCoder launcher component is missing: $requiredPath"
    }
}
if (-not (Test-Path -LiteralPath $ProjectDir -PathType Container)) {
    throw "QCoder project directory does not exist: $ProjectDir"
}

$pythonCommand = Get-Command python -CommandType Application -All -ErrorAction Stop |
    Where-Object { $_.Source -and (Test-Path -LiteralPath $_.Source -PathType Leaf) } |
    Select-Object -First 1
if (-not $pythonCommand) {
    throw 'Python is not installed or no application executable is available on PATH.'
}
$python = [string]$pythonCommand.Source
if (-not $WorkerId) {
    $hostToken = if ($env:COMPUTERNAME) { $env:COMPUTERNAME.ToLowerInvariant() } else { 'windows' }
    $WorkerId = "qcoder-$hostToken-$(Get-Date -Format 'HHmmss')"
}
if ($WorkerId -notmatch '^[A-Za-z0-9._:-]{1,96}$') {
    throw 'WorkerId contains characters unsupported by the QCoder GPU lease.'
}

$launcher = @{
    WorkerId = $WorkerId
    ProjectDir = $governanceRoot
    CodexCliPath = $python
    CodexCliEntrypoint = $adapterPath
    Verify = $Verify
    Swarm = $Swarm
    ControlPort = $ControlPort
    MaxRestarts = $MaxRestarts
    RestartDelaySeconds = $RestartDelaySeconds
}
if ($Role) { $launcher.Role = $Role }
if ($ResumeSession) { $launcher.ResumeSession = $ResumeSession }
$targetWorkspace = (Resolve-Path -LiteralPath $ProjectDir).Path
$workspaceDirective = "Target workspace: $targetWorkspace. Read and follow its nearest AGENTS.md and CLAUDE.md files before editing."
if ($Mission) {
    $launcher.Mission = "$Mission $workspaceDirective"
} else {
    $launcher.Mission = "Operate autonomously in the selected QCoder workspace. $workspaceDirective"
}
if ($RunId) { $launcher.RunId = $RunId }
foreach ($switchName in @(
    'Continue', 'New', 'Loop', 'Queue', 'Headless', 'UntilDone', 'Safe',
    'NoHydrate', 'NoSearch', 'NoControl', 'DryRun'
)) {
    if ($PSBoundParameters.ContainsKey($switchName) -and $PSBoundParameters[$switchName]) {
        $launcher[$switchName] = $true
    }
}

$priorDefaults = $env:QWEN_CODE_SYSTEM_SETTINGS_PATH
$priorTarget = $env:QCODER_TARGET_DIR
$priorLeaseToken = $env:QCODER_GPU_LEASE_TOKEN
$leaseToken = $null
$leaseHeartbeat = $null
$leaseMutex = $null
$leaseMutexAcquired = $false
$supervisorWatchdog = $null
$exitCode = 1
$settingsName = if ($env:QCODER_PLUGIN_MODE -eq '1') { 'qwen-plugin-settings.json' } else { 'qwen-settings.json' }
$env:QWEN_CODE_SYSTEM_SETTINGS_PATH = Join-Path $PSScriptRoot $settingsName
$env:QCODER_TARGET_DIR = $targetWorkspace
try {
    if ($env:QCODER_PLUGIN_MODE -eq '1' -and $env:QCODER_SUPERVISOR_PID -match '^\d+$') {
        $supervisorWatchdog = Start-Job -ArgumentList ([int]$env:QCODER_SUPERVISOR_PID), $PID -ScriptBlock {
            param($SupervisorPid, $LauncherPid)
            $ErrorActionPreference = 'SilentlyContinue'
            while (Get-Process -Id $SupervisorPid -ErrorAction SilentlyContinue) {
                Start-Sleep -Seconds 2
            }
            Stop-Process -Id $LauncherPid -Force -ErrorAction SilentlyContinue
        }
    }
    if (-not $NoGpuLease -and -not $DryRun) {
        if (-not (Get-Command ssh -CommandType Application -ErrorAction SilentlyContinue)) {
            throw 'OpenSSH is required for the governed FORGE GPU lease.'
        }
        $leaseMutex = [Threading.Mutex]::new($false, 'Global\ECHO_QCODER_GPU_LEASE')
        $leaseMutexAcquired = $leaseMutex.WaitOne(0)
        if (-not $leaseMutexAcquired) {
            throw 'Another qcoder session on HAMMER already owns the GPU lease.'
        }
        $leaseToken = if ($env:QCODER_GPU_LEASE_TOKEN -match '^[a-f0-9]{32}$') {
            $env:QCODER_GPU_LEASE_TOKEN
        }
        else {
            [guid]::NewGuid().ToString('N')
        }
        Write-Host (Invoke-QcoderGpuLease -Action acquire -Token $leaseToken -Holder $WorkerId -Ttl $LeaseTtlSeconds)
        $leaseHeartbeat = Start-Job -ArgumentList $leaseToken, $LeaseTtlSeconds, $leaseController -ScriptBlock {
            param($Token, $Ttl, $Controller)
            $ErrorActionPreference = 'SilentlyContinue'
            while ($true) {
                Start-Sleep -Seconds 60
                & ssh forge sudo $Controller renew --token $Token --ttl ([string]$Ttl) *> $null
                if ($LASTEXITCODE -ne 0) { break }
            }
        }
    }
    Remove-Item Env:QCODER_GPU_LEASE_TOKEN -ErrorAction SilentlyContinue
    if ($AdditionalArguments) {
        & $codexAutoPath @launcher @AdditionalArguments
    } else {
        & $codexAutoPath @launcher
    }
    $exitCode = $LASTEXITCODE
} finally {
    if ($supervisorWatchdog) {
        Stop-Job -Job $supervisorWatchdog -ErrorAction SilentlyContinue
        Remove-Job -Job $supervisorWatchdog -Force -ErrorAction SilentlyContinue
    }
    if ($leaseHeartbeat) {
        Stop-Job -Job $leaseHeartbeat -ErrorAction SilentlyContinue
        Remove-Job -Job $leaseHeartbeat -Force -ErrorAction SilentlyContinue
    }
    if ($leaseToken) {
        Write-Host (Invoke-QcoderGpuLease -Action release -Token $leaseToken)
    }
    if ($leaseMutexAcquired -and $leaseMutex) {
        $leaseMutex.ReleaseMutex()
    }
    if ($leaseMutex) {
        $leaseMutex.Dispose()
    }
    if ($null -eq $priorDefaults) {
        Remove-Item Env:QWEN_CODE_SYSTEM_SETTINGS_PATH -ErrorAction SilentlyContinue
    } else {
        $env:QWEN_CODE_SYSTEM_SETTINGS_PATH = $priorDefaults
    }
    if ($null -eq $priorTarget) {
        Remove-Item Env:QCODER_TARGET_DIR -ErrorAction SilentlyContinue
    } else {
        $env:QCODER_TARGET_DIR = $priorTarget
    }
    if ($null -eq $priorLeaseToken) {
        Remove-Item Env:QCODER_GPU_LEASE_TOKEN -ErrorAction SilentlyContinue
    } else {
        $env:QCODER_GPU_LEASE_TOKEN = $priorLeaseToken
    }
}
exit $exitCode
