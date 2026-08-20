# FORGE-local Qwen 27B 128K route

## Contract

The model runtime and the governed caller route are deliberately separate:

- Raw Ollama: `http://127.0.0.1:11436`, reachable only inside FORGE.
- Governed gateway: `http://127.0.0.1:11437` and LAN `http://192.168.1.220:11437`.
- Stable model alias: `c3po-code:echo-abliterated-128k`.
- Staged alias digest: `a8b6dbff993304b29040d734ebc2d118b212e23feec64e0343fff85d9c02c5b0` (captured again into every deployment receipt).
- Exact parent: `huihui_ai/Qwen3.6-abliterated:27b`.
- Exact parent digest: `418838acbea7dad6eca43e2f74519307235e62b584e08ab7a6e7d6916cff7507`.
- Context: exactly 131,072 tokens.
- Mode: nonthinking (`think:false`, OpenAI `reasoning_effort:"none"`).

Consumers use the governed `/ready` endpoint on port `11437`; raw Ollama on
`11436` is not a readiness surface. The response publishes the exact
`base_model`, `sha256:`-prefixed `base_digest`, `context_length`, `resident`,
`truncate`, `shift`, and tracked `release_sha` so callers can enforce the full
runtime contract without inferring identity from a status code.

Former `qcoder-32k` and `qcoder-64k` tags may remain in the persistent Ollama volume as recoverable historical data, but no launcher, gateway, SDK capability, or model-registry row selects them. The one active route is explicitly identified as provider `ollama-local-forge`; cloud Qwen providers remain separate registry rows.

## Fail-closed readiness

`GET /health` and `GET /ready` return HTTP 200 only when every check passes. Any failure returns HTTP 503 with `ok:false`. Readiness verifies:

1. the stable alias exists at its deployment-recorded exact digest;
2. `/api/show` reports the exact parent model and `num_ctx 131072`;
3. `/api/ps` reports the exact stable-alias digest, exact context, exact model byte size, and `size_vram == size`;
4. the pinned Docker container is running, not OOM-killed, and healthy;
5. an Ollama runner process is resident on exactly two GPUs;
6. `QWEN_RELEASE_SHA` is an exact lowercase 40-hex tracked release commit.

A stopped, cold, partially offloaded, wrong-model, wrong-context, wrong-digest, or unreachable runtime is red. `GET /livez` is the process-only liveness endpoint and never substitutes for readiness.

## Exact token admission

The gateway does not use character estimates and never clips messages. It prepends one fixed nonthinking system message, then sends the identical messages and tool schemas through Ollama's Qwen 3.5 chat renderer for both preflight and generation. The exact preflight calls Ollama `/api/chat` with a one-token output. Every upstream request forces top-level `truncate:false` and `shift:false`; Ollama 0.32.0 therefore rejects overflow instead of silently dropping old messages. The returned `prompt_eval_count` is the authoritative tokenizer plus chat-template count. Native tool calls are preserved, and OpenAI responses convert them into standard `tool_calls` objects.

Admission is:

```text
prompt_eval_count
+ wrapper safety margin (128)
+ tool safety margin (512 with tools, 128 without tools)
+ caller output reserve (default 4096, maximum 8192)
<= 131072
```

An over-budget request receives HTTP 413 with all counts. The requested generation must report exactly the same `prompt_eval_count` as preflight; drift returns HTTP 502. Responses and headers expose prompt count, reserves, remaining capacity, `truncated:false`, and `shifted:false`.

The gateway permits one active model request and one queued request. A third concurrent request receives HTTP 429 with a retry hint. Ollama is also configured with `OLLAMA_NUM_PARALLEL=1`; there is no ambiguous 32K/64K alias fallback.

## Surfaces

- `POST /api/chat` — native non-streaming chat; `think` must be false.
- `POST /v1/chat/completions` — OpenAI-compatible non-streaming chat; `reasoning_effort` must be `none`.
- `POST /v1/token-budget` — exact tokenizer/template preflight only.
- `GET /v1/models` — the one stable local model.
- `GET /health`, `/ready`, `/livez`, `/metrics`.

Structured logs contain only request ID, method, path, status, duration, and request byte count. Prompts, completions, tools, cookies, authorization values, and secrets are never logged. Docker uses `json-file` rotation at 10 MiB and five files.

## SDK and registry

`register.sql` idempotently registers:

- `echo.qwen.local.health`
- `echo.qwen.local.chat`
- `echo.qwen.local.openai_chat`
- `echo.qwen.local.token_budget`

It also registers `forge-local-qwen-27b-128k` in `arcanum_sdk.model_registry` and `(ollama-local-forge, c3po-code:echo-abliterated-128k)` in `arcanum_sdk.llm_models`. These names intentionally distinguish this dedicated loopback runtime from Groq, OpenRouter, Together, Cloudflare, NVIDIA, and other cloud Qwen catalog entries.

## Staging, verification, and promotion

Run from an exact clean commit on FORGE:

```bash
sudo deployment/forge/qwen_route/stage-qwen-route.sh
```

The stage unit binds only `127.0.0.1:18437` and runs the quick native/OpenAI/wrong-model/readiness suite against the production-shaped raw runtime. It does not modify the production gateway or SDK registry.

After staging is green:

```bash
sudo deployment/forge/qwen_route/install-qwen-route.sh
python3 deployment/forge/qwen_route/verify-qwen-route.py \
  --long-context --concurrency \
  --report /home/forge/services/qwen-route/acceptance.json
```

The long-context suite fits prompts using the gateway's own exact preflight, then runs deterministic five-needle canaries above 32K and near 120K with a 4K admission reserve. `--concurrency` proves one active request, one queued request, and an explicit 429 third request.

The controlled recovery suite is intentionally separate because it kills and restarts the dedicated container:

```bash
sudo python3 deployment/forge/qwen_route/verify-qwen-route.py \
  --destructive \
  --report /home/forge/services/qwen-route/recovery.json
```

It first unloads the model and requires cold readiness to turn red, records the controlled cold reload and subsequent warm-preflight latency, then requires the route to turn red after container death, recover through systemd supervision, retain the exact alias across a service restart, retain volume `ollama_ollama_data`, retain bounded Docker logging, and show no new Qwen Xid/OOM evidence.

## Lifecycle and rollback

The Ollama image is pinned to `ollama/ollama@sha256:57f573b47f1f71ebb445789f279fe3e596a8beab182f7cf486db9205bad87c5a`. The external volume remains `ollama_ollama_data`; provisioning never removes a model or volume. `echo-qwen-home.service` is `Type=simple`, blocks in `docker wait`, and uses `Restart=always`, so systemd follows actual container liveness instead of remaining falsely green after a oneshot Compose launch.

Every install backs up the previous Compose file, units, drop-in, route environment, container inspection, and volume inspection under:

```text
/home/forge/services/qwen-route/backups/<UTC timestamp>/
```

The deployment receipt records the exact Git commit, parent and alias digests, 131072 context, image digest, volume, file hashes, and backup directory. Roll back only with that exact directory:

```bash
sudo deployment/forge/qwen_route/rollback-qwen-route.sh \
  /home/forge/services/qwen-route/backups/<UTC timestamp>
```

Rollback restores prior service/configuration files without deleting or rewriting the model volume, then restarts and re-verifies the runtime.
