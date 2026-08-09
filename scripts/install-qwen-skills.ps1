[CmdletBinding(SupportsShouldProcess)]
param(
    [string]$Destination = (Join-Path $HOME '.qwen\skills'),
    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$sourceRoot = Join-Path $root 'qwen-skills'
$destinationRoot = [IO.Path]::GetFullPath($Destination)
if (-not (Test-Path -LiteralPath $sourceRoot -PathType Container)) {
    throw "Qwen skill source directory is missing: $sourceRoot"
}
New-Item -ItemType Directory -Path $destinationRoot -Force | Out-Null

$installed = @()
foreach ($source in Get-ChildItem -LiteralPath $sourceRoot -Directory | Sort-Object Name) {
    $skillFile = Join-Path $source.FullName 'SKILL.md'
    if (-not (Test-Path -LiteralPath $skillFile -PathType Leaf)) {
        throw "Qwen skill has no SKILL.md: $($source.Name)"
    }
    $firstLines = Get-Content -LiteralPath $skillFile -TotalCount 4
    if ($firstLines.Count -lt 4 -or $firstLines[0] -ne '---' -or $firstLines[1] -ne "name: $($source.Name)" -or $firstLines[2] -notmatch '^description: .+') {
        throw "Qwen skill front matter is invalid: $($source.Name)"
    }
    $target = Join-Path $destinationRoot $source.Name
    if ((Test-Path -LiteralPath $target) -and -not $Force) {
        $sourceHash = (Get-FileHash -LiteralPath $skillFile -Algorithm SHA256).Hash
        $targetSkill = Join-Path $target 'SKILL.md'
        if ((Test-Path -LiteralPath $targetSkill) -and (Get-FileHash -LiteralPath $targetSkill -Algorithm SHA256).Hash -eq $sourceHash) {
            $installed += [pscustomobject]@{ Name = $source.Name; Status = 'current'; Path = $target }
            continue
        }
        throw "Qwen skill already exists with different content: $target. Re-run with -Force to replace only this managed skill directory."
    }
    if ($PSCmdlet.ShouldProcess($target, 'Install QCoder Qwen skill')) {
        New-Item -ItemType Directory -Path $target -Force | Out-Null
        Get-ChildItem -LiteralPath $source.FullName -Force | ForEach-Object {
            Copy-Item -LiteralPath $_.FullName -Destination $target -Recurse -Force
        }
        $installed += [pscustomobject]@{ Name = $source.Name; Status = 'installed'; Path = $target }
    }
}

$installed | Format-Table -AutoSize
Write-Host "QWEN_SKILLS_OK count=$($installed.Count) destination=$destinationRoot"
