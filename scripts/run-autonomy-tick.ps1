[CmdletBinding()]
param(
    [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot),
    [switch]$SkipIssueReconciliation
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = (Resolve-Path -LiteralPath $RepoRoot).Path
$tickScript = Join-Path $root 'scripts\autonomy-tick.mjs'
$reportPath = Join-Path $root '.runtime\autonomy\latest.json'
if (-not (Test-Path -LiteralPath $tickScript -PathType Leaf)) {
    throw "QCoder autonomy tick is missing: $tickScript"
}
$node = Get-Command node -ErrorAction Stop

Set-Location -LiteralPath $root
& $node.Source $tickScript --output '.runtime/autonomy/latest.json'
$tickExitCode = $LASTEXITCODE
if (-not (Test-Path -LiteralPath $reportPath -PathType Leaf)) {
    throw 'QCoder autonomy tick did not produce its report.'
}
$report = Get-Content -LiteralPath $reportPath -Raw | ConvertFrom-Json

if (-not $SkipIssueReconciliation) {
    $gh = Get-Command gh -ErrorAction Stop
    & $gh.Source auth status *> $null
    if ($LASTEXITCODE -ne 0) { throw 'GitHub CLI authentication is unavailable.' }

    $repository = 'ECHO-OMEGA-PRIME/echo-qcoder'
    $title = 'QCoder autonomy tick needs attention'
    $issueJson = & $gh.Source issue list --repo $repository --state open --search "`"$title`" in:title" --limit 1 --json number
    if ($LASTEXITCODE -ne 0) { throw 'Unable to query the QCoder autonomy issue.' }
    $issues = @($issueJson | ConvertFrom-Json)

    if (-not [bool]$report.ok) {
        $failed = @($report.failed) -join ', '
        $body = "HAMMER QCoder autonomy tick failed. Failed gates: $failed. Checked: $($report.checkedAt). The sanitized report remains on HAMMER."
        if ($issues.Count -gt 0) {
            & $gh.Source issue comment $issues[0].number --repo $repository --body $body | Out-Null
        } else {
            & $gh.Source issue create --repo $repository --title $title --body $body | Out-Null
        }
    } elseif ($issues.Count -gt 0) {
        $body = "HAMMER QCoder autonomy tick recovered. Checked: $($report.checkedAt)."
        & $gh.Source issue comment $issues[0].number --repo $repository --body $body | Out-Null
        & $gh.Source issue close $issues[0].number --repo $repository --reason completed | Out-Null
    }
    if ($LASTEXITCODE -ne 0) { throw 'Unable to reconcile the QCoder autonomy issue.' }
}

if ($tickExitCode -ne 0) { exit $tickExitCode }
Write-Host "QCODER_AUTONOMY_RUNNER_OK checked=$($report.checkedAt)"
