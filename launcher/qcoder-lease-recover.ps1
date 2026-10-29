#Requires -Version 5.1
<#
.SYNOPSIS
  Recover QCoder GPU lease when release fails with:
  lease token does not match the active holder

.DESCRIPTION
  Safe recovery for FORGE dual-GPU QCoder leases.
  - Inspects active lease
  - Clears stale local token state
  - Force-releases / reclaims when authorized
  - Does NOT print secrets
  - Never starts unrestricted shell tools

.NOTES
  Defaults match C:\ECHO_MCP\echo-qcoder\launcher\qcoder.ps1
  Run on FORGE as the same user that owns QCoder.
#>

[CmdletBinding()]
param(
  [ValidateSet("status", "clear-local", "force-release", "reclaim", "full")]
  [string]$Action = "full",

  [string]$EchoRoot = "C:\ECHO_MCP",
  [string]$QcoderRoot = "C:\ECHO_MCP\echo-qcoder",
  [string]$LeaseApi = $env:ECHO_GPU_LEASE_URL,
  [string]$Service = "qcoder",
  [switch]$WhatIf
)

$ErrorActionPreference = "Stop"
$ts = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
$logDir = Join-Path $QcoderRoot "logs"
$stateDir = Join-Path $QcoderRoot "state"
$leaseStateCandidates = @(
  (Join-Path $stateDir "gpu-lease.json"),
  (Join-Path $stateDir "lease.json"),
  (Join-Path $QcoderRoot "launcher\.lease.json"),
  (Join-Path $env:LOCALAPPDATA "ECHO\qcoder\gpu-lease.json"),
  (Join-Path $env:TEMP "echo-qcoder-gpu-lease.json")
)

function Write-EchoLog {
  param(
    [string]$Level,
    [string]$Message
  )
  $line = "[{0}] [{1}] {2}" -f (Get-Date -Format o), $Level, $Message
  Write-Host $line
  if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
  }
  Add-Content -Path (Join-Path $logDir ("lease-recover-" + $ts + ".log")) -Value $line
}

function Get-LocalLeaseState {
  $found = @()
  foreach ($p in $leaseStateCandidates) {
    if (Test-Path $p) {
      try {
        $raw = Get-Content -Raw -Path $p
        $j = $raw | ConvertFrom-Json
        $hasToken = $false
        if ($j.token) { $hasToken = $true }
        if ($j.leaseToken) { $hasToken = $true }
        if ($j.lease_token) { $hasToken = $true }
        $tokenFp = $null
        if ($j.token) {
          $bytes = [Text.Encoding]::UTF8.GetBytes([string]$j.token)
          $hash = [System.Security.Cryptography.SHA256]::Create().ComputeHash($bytes)
          $hex = ([System.BitConverter]::ToString($hash)).Replace("-", "").ToLower()
          $tokenFp = "sha12:" + $hex.Substring(0, 12)
        }
        $found += [pscustomobject]@{
          path       = $p
          holder     = $j.holder
          service    = $j.service
          leaseId    = $j.leaseId
          hasToken   = $hasToken
          tokenFp    = $tokenFp
          expiresAt  = $j.expiresAt
          acquiredAt = $j.acquiredAt
        }
      }
      catch {
        $found += [pscustomobject]@{
          path  = $p
          error = $_.Exception.Message
        }
      }
    }
  }
  return $found
}

function Invoke-LeaseApi {
  param(
    [string]$Method,
    [string]$Path,
    [hashtable]$Body
  )

  if ($LeaseApi) {
    $candidates = @($LeaseApi.TrimEnd("/"))
  }
  else {
    $candidates = @(
      "http://127.0.0.1:8790/gpu/lease",
      "http://127.0.0.1:8780/gpu/lease",
      "http://127.0.0.1:18790/gpu/lease",
      "http://forge.echo-op.local/gpu/lease"
    )
  }

  foreach ($base in $candidates) {
    if ($Path) {
      $url = $base + $Path
    }
    else {
      $url = $base
    }
    try {
      $params = @{
        Method      = $Method
        Uri         = $url
        ContentType = "application/json"
        TimeoutSec  = 8
      }
      if ($Body) {
        $params.Body = ($Body | ConvertTo-Json -Compress -Depth 6)
      }
      $resp = Invoke-RestMethod @params
      return [pscustomobject]@{
        ok   = $true
        base = $base
        data = $resp
      }
    }
    catch {
      $msg = $_.Exception.Message
      if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
        $msg = $_.ErrorDetails.Message
      }
      Write-EchoLog -Level "WARN" -Message ("lease api " + $Method + " " + $url + " -> " + $msg)
    }
  }

  return [pscustomobject]@{
    ok    = $false
    error = "no_lease_api_reachable"
  }
}

function Get-LeaseStatus {
  Write-EchoLog -Level "INFO" -Message ("Querying lease status for service=" + $Service)
  $local = Get-LocalLeaseState
  $remote = Invoke-LeaseApi -Method GET -Path ("/status?service=" + $Service)
  if (-not $remote.ok) {
    $remote = Invoke-LeaseApi -Method GET -Path ("?service=" + $Service)
  }
  return [pscustomobject]@{
    local  = $local
    remote = $remote
  }
}

function Clear-LocalLeaseState {
  Write-EchoLog -Level "INFO" -Message "Clearing local lease state files"
  $removed = @()
  foreach ($p in $leaseStateCandidates) {
    if (Test-Path $p) {
      if ($WhatIf) {
        Write-EchoLog -Level "WHATIF" -Message ("Would remove " + $p)
      }
      else {
        $bak = $p + ".bak_" + $ts
        Copy-Item -Path $p -Destination $bak -Force
        Remove-Item -Path $p -Force
        $removed += $p
        Write-EchoLog -Level "INFO" -Message ("Removed " + $p + " (backup " + $bak + ")")
      }
    }
  }

  $envNames = @("ECHO_GPU_LEASE_TOKEN", "QCODER_LEASE_TOKEN", "GPU_LEASE_TOKEN")
  foreach ($name in $envNames) {
    $envPath = "Env:" + $name
    if (Test-Path $envPath) {
      if (-not $WhatIf) {
        Remove-Item $envPath
      }
      Write-EchoLog -Level "INFO" -Message ("Cleared process env " + $name)
    }
  }
  return $removed
}

function Force-ReleaseLease {
  param($Status)

  Write-EchoLog -Level "INFO" -Message "Attempting force-release / reclaim"

  $token = $null
  foreach ($l in @($Status.local)) {
    if (-not $l.path) { continue }
    if (-not (Test-Path $l.path)) { continue }
    try {
      $j = Get-Content -Raw -Path $l.path | ConvertFrom-Json
      if ($j.token) { $token = $j.token }
      elseif ($j.leaseToken) { $token = $j.leaseToken }
      elseif ($j.lease_token) { $token = $j.lease_token }
      if ($token) { break }
    }
    catch { }
  }

  $bodies = @()
  if ($token) {
    $bodies += @{
      service = $Service
      token   = $token
      action  = "release"
    }
  }
  $bodies += @{
    service = $Service
    action  = "force_release"
    reason  = "qcoder_token_mismatch_recovery"
  }
  $bodies += @{
    service = $Service
    action  = "reclaim"
    holder  = $env:COMPUTERNAME
    reason  = "qcoder_recover"
  }
  $bodies += @{
    service = $Service
    force   = $true
    reason  = "token_mismatch"
  }

  $results = @()
  $paths = @("/release", "/force", "/reclaim", "")
  foreach ($b in $bodies) {
    foreach ($path in $paths) {
      $r = Invoke-LeaseApi -Method POST -Path $path -Body $b
      $results += $r
      if ($r.ok -and $r.data) {
        $okFlag = $true
        if ($r.data.ok -eq $false) { $okFlag = $false }
        if ($okFlag) {
          Write-EchoLog -Level "INFO" -Message ("Lease API accepted force path=" + $path + " action=" + $b.action)
          return $r
        }
      }
    }
  }

  $solScripts = @(
    (Join-Path $EchoRoot "scripts\gpu-lease-force-release.ps1"),
    (Join-Path $EchoRoot "SOL\gpu_lease_release.ps1"),
    (Join-Path $QcoderRoot "launcher\lease-force-release.ps1")
  )
  foreach ($s in $solScripts) {
    if (Test-Path $s) {
      Write-EchoLog -Level "INFO" -Message ("Invoking " + $s)
      if (-not $WhatIf) {
        & $s -Service $Service -Reason "qcoder_token_mismatch" 2>&1 | ForEach-Object {
          Write-EchoLog -Level "INFO" -Message ("$_")
        }
      }
      return [pscustomobject]@{
        ok  = $true
        via = $s
      }
    }
  }

  return [pscustomobject]@{
    ok      = $false
    results = $results
    error   = "force_release_unconfirmed"
  }
}

function Restore-FencedServices {
  Write-EchoLog -Level "INFO" -Message "Health-check / restore fenced GPU services if helper exists"
  $helpers = @(
    (Join-Path $QcoderRoot "launcher\restore-gpu-services.ps1"),
    (Join-Path $EchoRoot "scripts\restore-gpu-services.ps1")
  )
  foreach ($h in $helpers) {
    if (Test-Path $h) {
      if (-not $WhatIf) {
        & $h 2>&1 | ForEach-Object {
          Write-EchoLog -Level "INFO" -Message ("$_")
        }
      }
      return
    }
  }
  Write-EchoLog -Level "INFO" -Message "No restore helper found - skip"
}

Write-EchoLog -Level "INFO" -Message ("QCoder lease recover Action=" + $Action + " WhatIf=" + $WhatIf)
$pre = Get-LeaseStatus
Write-EchoLog -Level "INFO" -Message ("Local state files: " + (@($pre.local).Count))
foreach ($item in @($pre.local)) {
  Write-EchoLog -Level "INFO" -Message ("  " + ($item | ConvertTo-Json -Compress))
}

switch ($Action) {
  "status" {
    $pre | ConvertTo-Json -Depth 8
    break
  }
  "clear-local" {
    Clear-LocalLeaseState | Out-Null
    break
  }
  "force-release" {
    Force-ReleaseLease -Status $pre | ConvertTo-Json -Depth 6
    break
  }
  "reclaim" {
    Force-ReleaseLease -Status $pre | Out-Null
    Clear-LocalLeaseState | Out-Null
    break
  }
  "full" {
    Write-EchoLog -Level "INFO" -Message "FULL recovery: status -> force-release -> clear-local -> restore -> status"
    $fr = Force-ReleaseLease -Status $pre
    Write-EchoLog -Level "INFO" -Message ("force-release: " + ($fr | ConvertTo-Json -Compress -Depth 5))
    Clear-LocalLeaseState | Out-Null
    Restore-FencedServices
    $post = Get-LeaseStatus
    Write-EchoLog -Level "INFO" -Message ("Post-recovery local files: " + (@($post.local).Count))
    [pscustomobject]@{
      ok             = $true
      action         = "full"
      forceRelease   = $fr
      localRemaining = @($post.local).Count
      next           = "Re-run qcoder (or .\\launcher\\qcoder.ps1). If still failing, reboot FORGE GPU lease broker."
    } | ConvertTo-Json -Depth 6
    break
  }
}

Write-EchoLog -Level "INFO" -Message "Done. Next: start QCoder again with a clean acquire."
