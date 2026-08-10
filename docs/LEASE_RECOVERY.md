# QCoder GPU lease recovery

## Symptom
```
QCoder GPU lease release failed:
{"ok": false, "code": "unauthorized",
 "message": "lease token does not match the active holder"}
```

## Cause
Local launcher token ≠ active holder on the GPU lease broker (crash, double start, expiry, reclaim).

## Fix on FORGE (one shot)
```powershell
# 1) Install recover script next to launcher
copy \\path\to\qcoder-lease-recover.ps1 C:\ECHO_MCP\echo-qcoder\launcher\

# 2) Full recover
powershell -NoProfile -ExecutionPolicy Bypass -File C:\ECHO_MCP\echo-qcoder\launcher\qcoder-lease-recover.ps1 -Action full

# 3) Start clean
qcoder
```

## Nexus
- `GET /api/nexus/qcoder/lease` — playbook + incidents
- `POST /api/nexus/qcoder/lease/incident` — `{ "message": "...", "code": "unauthorized" }`
