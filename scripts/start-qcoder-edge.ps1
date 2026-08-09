# Start governed QCoder MCP (loopback) + ensure OAuth edge is up
$ErrorActionPreference = 'Stop'
$qcoderRoot = 'C:\ECHO_MCP\echo-qcoder'
$bridge = 'C:\ECHO_OMEGA_PRIME\GROK_BRIDGE'

# QCoder on 18788
$qListen = Get-NetTCPConnection -LocalPort 18788 -State Listen -EA SilentlyContinue
if (-not $qListen) {
  $env:QCODER_LOCAL_DEV_AUTH = '1'
  $env:HOST = '127.0.0.1'
  $env:PORT = '18788'
  $env:QCODER_WORKSPACES_JSON = '{"echo-qcoder":"C:\\ECHO_MCP\\echo-qcoder"}'
  Start-Process -FilePath node -ArgumentList '.\server\dist\index.js' -WorkingDirectory $qcoderRoot -WindowStyle Hidden
  Start-Sleep 2
}

# OAuth connector on 8796
$oListen = Get-NetTCPConnection -LocalPort 8796 -State Listen -EA SilentlyContinue
if (-not $oListen) {
  Start-Process -FilePath 'C:\Program Files\Python313\python.exe' -ArgumentList '-u','echo_oauth_mcp_connector.py' -WorkingDirectory $bridge -WindowStyle Hidden
  Start-Sleep 2
}

Write-Host 'QCODER_EDGE_OK resource=https://mcp.echo-op.com/oauth-mcp-qcoder-v1 upstream=127.0.0.1:18788'
