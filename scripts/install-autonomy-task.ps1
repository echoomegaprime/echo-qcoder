[CmdletBinding()]
param(
    [ValidateNotNullOrEmpty()]
    [string]$TaskName = 'ECHO QCoder Autonomy Tick',
    [switch]$StartNow
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$runner = Join-Path $PSScriptRoot 'run-autonomy-tick.ps1'
if (-not (Test-Path -LiteralPath $runner -PathType Leaf)) {
    throw "QCoder autonomy runner is missing: $runner"
}
$pwsh = Get-Command pwsh -ErrorAction Stop
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name

$arguments = "-NoLogo -NoProfile -NonInteractive -File `"$runner`" -RepoRoot `"$root`""
$action = New-ScheduledTaskAction -Execute $pwsh.Source -Argument $arguments -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger `
    -Once `
    -At (Get-Date).AddMinutes(2) `
    -RepetitionInterval (New-TimeSpan -Hours 6) `
    -RepetitionDuration (New-TimeSpan -Days 3650)
$principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 30) `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings `
    -Description 'Runs the verified QCoder upstream, dependency, and regression gate every six hours.' `
    -Force | Out-Null

if ($StartNow) { Start-ScheduledTask -TaskName $TaskName }
$task = Get-ScheduledTask -TaskName $TaskName
$info = Get-ScheduledTaskInfo -TaskName $TaskName
Write-Host "QCODER_AUTONOMY_TASK_READY name=$($task.TaskName) state=$($task.State) next=$($info.NextRunTime.ToString('o'))"
