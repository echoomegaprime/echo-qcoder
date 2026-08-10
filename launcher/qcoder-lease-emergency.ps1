# QCoder lease emergency recover (no secrets)
$ErrorActionPreference = "Continue"
$root = "C:\ECHO_MCP\echo-qcoder"
$paths = @(
  "$root\state\gpu-lease.json",
  "$root\state\lease.json",
  "$root\launcher\.lease.json",
  "$env:LOCALAPPDATA\ECHO\qcoder\gpu-lease.json",
  "$env:TEMP\echo-qcoder-gpu-lease.json"
)
Write-Host "=== Clear local lease state ==="
foreach ($p in $paths) {
  if (Test-Path $p) {
    Copy-Item $p "$p.bak_$(Get-Date -Format yyyyMMddHHmmss)" -Force
    Remove-Item $p -Force
    Write-Host "removed $p"
  } else { Write-Host "absent  $p" }
}
@("ECHO_GPU_LEASE_TOKEN","QCODER_LEASE_TOKEN","GPU_LEASE_TOKEN") | ForEach-Object {
  if (Test-Path "Env:$_") { Remove-Item "Env:$_"; Write-Host "cleared env $_" }
}
Write-Host "=== Try lease force endpoints ==="
$bodies = @(
  @{ service="qcoder"; action="force_release"; reason="token_mismatch" },
  @{ service="qcoder"; action="reclaim"; reason="qcoder_recover" },
  @{ service="qcoder"; force=$true; reason="token_mismatch" }
)
$urls = @(
  "http://127.0.0.1:8790/gpu/lease/force",
  "http://127.0.0.1:8790/gpu/lease/release",
  "http://127.0.0.1:8790/gpu/lease/reclaim",
  "http://127.0.0.1:8780/gpu/lease/force",
  "http://127.0.0.1:18790/gpu/lease/force"
)
foreach ($u in $urls) {
  foreach ($b in $bodies) {
    try {
      $r = Invoke-RestMethod -Method POST -Uri $u -ContentType "application/json" -Body ($b|ConvertTo-Json -Compress) -TimeoutSec 5
      Write-Host "OK $u -> $($r | ConvertTo-Json -Compress)"
    } catch {
      Write-Host "skip $u ($($_.Exception.Message))"
    }
  }
}
$helpers = @(
  "$root\launcher\restore-gpu-services.ps1",
  "C:\ECHO_MCP\scripts\restore-gpu-services.ps1"
)
foreach ($h in $helpers) {
  if (Test-Path $h) { Write-Host "running $h"; & $h }
}
Write-Host "=== Done. Run: qcoder ==="
