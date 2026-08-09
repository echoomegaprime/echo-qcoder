
# LOCAL_TESTING.md

npm run typecheck && npm test && npm run build
$env:QCODER_LOCAL_DEV_AUTH=1; $env:PORT=18788; node .\server\dist\index.js
node .\scripts\mcp-smoke.mjs http://127.0.0.1:18788/mcp

