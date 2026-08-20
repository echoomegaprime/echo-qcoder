\set ON_ERROR_STOP on

INSERT INTO arcanum_sdk.sdk_capabilities (
  id, description, handler_kind, target_url, target_method, args_mode,
  target_node, input_schema_json, output_schema_json, required_scope,
  rate_cost, danger_tier, schema_version, is_builtin, health_status,
  requires_guard_scan, never_archive, lifecycle_status,
  default_timeout_seconds, never_breaker_block, static_headers
)
VALUES
(
  'echo.qwen.local.health',
  'Fail-closed exact-digest health for the FORGE-local Qwen 27B 128K route (not a cloud Qwen lane)',
  'http', 'http://127.0.0.1:11437/health', 'GET', 'query', 'forge',
  '{"type":"object","properties":{"command":{"const":"health"}},"required":["command"],"additionalProperties":false}'::jsonb,
  '{"type":"object","required":["ok","status","service","base_model","base_digest","context_length","resident","truncate","shift","release_sha","checks"],"properties":{"ok":{"type":"boolean"},"status":{"type":"string"},"service":{"const":"echo-qwen-route"},"base_model":{"const":"huihui_ai/Qwen3.6-abliterated:27b"},"base_digest":{"type":"string","pattern":"^sha256:[0-9a-f]{64}$"},"context_length":{"const":131072},"resident":{"type":"boolean"},"truncate":{"const":false},"shift":{"const":false},"release_sha":{"type":"string","pattern":"^[0-9a-f]{40}$"},"checks":{"type":"object"}}}'::jsonb,
  'tier:0', 1, 0, 1, false, 'unknown', false, true, 'active', 10, true, '{}'::jsonb
),
(
  'echo.qwen.local.chat',
  'Native nonthinking chat through the exact FORGE-local Qwen 27B 128K route; no truncation or context shifting',
  'http', 'http://127.0.0.1:11437/api/chat', 'POST', 'json_body', 'forge',
  '{"type":"object","properties":{"command":{"const":"chat"},"model":{"const":"c3po-code:echo-abliterated-128k"},"messages":{"type":"array","minItems":1},"tools":{"type":"array"},"stream":{"const":false},"think":{"const":false},"options":{"type":"object"}},"required":["command","messages"],"additionalProperties":true}'::jsonb,
  '{"type":"object","required":["model","message","prompt_eval_count","route"],"properties":{"model":{"type":"string"},"message":{"type":"object"},"prompt_eval_count":{"type":"integer"},"route":{"type":"object"}}}'::jsonb,
  'tier:1', 4, 1, 1, false, 'unknown', true, true, 'active', 1800, true, '{}'::jsonb
),
(
  'echo.qwen.local.openai_chat',
  'OpenAI-compatible reasoning_effort=none chat through the exact FORGE-local Qwen 27B 128K route',
  'http', 'http://127.0.0.1:11437/v1/chat/completions', 'POST', 'json_body', 'forge',
  '{"type":"object","properties":{"command":{"const":"chat"},"model":{"const":"c3po-code:echo-abliterated-128k"},"messages":{"type":"array","minItems":1},"tools":{"type":"array"},"stream":{"const":false},"reasoning_effort":{"enum":["none",null]},"max_tokens":{"type":"integer","minimum":1,"maximum":8192}},"required":["command","messages"],"additionalProperties":true}'::jsonb,
  '{"type":"object","required":["id","object","model","choices","usage","route_metadata"]}'::jsonb,
  'tier:1', 4, 1, 1, false, 'unknown', true, true, 'active', 1800, true, '{}'::jsonb
),
(
  'echo.qwen.local.token_budget',
  'Authoritative no-truncate/no-shift Ollama tokenizer preflight for the FORGE-local Qwen route',
  'http', 'http://127.0.0.1:11437/v1/token-budget', 'POST', 'json_body', 'forge',
  '{"type":"object","properties":{"command":{"const":"token_budget"},"model":{"const":"c3po-code:echo-abliterated-128k"},"messages":{"type":"array","minItems":1},"tools":{"type":"array"},"reasoning_effort":{"enum":["none",null]},"max_tokens":{"type":"integer","minimum":1,"maximum":8192}},"required":["command","messages"],"additionalProperties":true}'::jsonb,
  '{"type":"object","required":["ok","model","budget"]}'::jsonb,
  'tier:1', 2, 1, 1, false, 'unknown', true, true, 'active', 1800, true, '{}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  description = EXCLUDED.description,
  handler_kind = EXCLUDED.handler_kind,
  target_url = EXCLUDED.target_url,
  target_method = EXCLUDED.target_method,
  args_mode = EXCLUDED.args_mode,
  target_node = EXCLUDED.target_node,
  input_schema_json = EXCLUDED.input_schema_json,
  output_schema_json = EXCLUDED.output_schema_json,
  required_scope = EXCLUDED.required_scope,
  rate_cost = EXCLUDED.rate_cost,
  danger_tier = EXCLUDED.danger_tier,
  schema_version = EXCLUDED.schema_version,
  requires_guard_scan = EXCLUDED.requires_guard_scan,
  never_archive = EXCLUDED.never_archive,
  lifecycle_status = 'active',
  default_timeout_seconds = EXCLUDED.default_timeout_seconds,
  never_breaker_block = EXCLUDED.never_breaker_block,
  updated_at = now();

INSERT INTO arcanum_sdk.model_registry (
  name, family, provider, endpoint, config, is_active, is_default
)
VALUES (
  'forge-local-qwen-27b-128k',
  'qwen3.6-abliterated',
  'ollama-local-forge',
  'http://127.0.0.1:11437/v1',
  jsonb_build_object(
    'route_kind', 'local_loopback_gateway',
    'raw_ollama', 'http://127.0.0.1:11438',
    'model_alias', 'c3po-code:echo-abliterated-128k',
    'base_model', 'huihui_ai/Qwen3.6-abliterated:27b',
    'base_digest', '418838acbea7dad6eca43e2f74519307235e62b584e08ab7a6e7d6916cff7507',
    'alias_digest', :'alias_digest',
    'context_window', 131072,
    'reasoning_effort', 'none',
    'cloud_lane', false,
    'single_active_request', true,
    'truncate', false,
    'shift', false
  ),
  true,
  false
)
ON CONFLICT (name) DO UPDATE SET
  family = EXCLUDED.family,
  provider = EXCLUDED.provider,
  endpoint = EXCLUDED.endpoint,
  config = EXCLUDED.config,
  is_active = true,
  is_default = false,
  updated_at = now();

INSERT INTO arcanum_sdk.llm_model_activation_permits (model_id, rationale)
VALUES (
  'c3po-code:echo-abliterated-128k',
  'Dedicated FORGE-local Qwen route passed exact-digest 128K, dual-GPU, concurrency, and destructive-recovery gates.'
)
ON CONFLICT (model_id) DO UPDATE SET
  rationale = EXCLUDED.rationale;

INSERT INTO arcanum_sdk.llm_models (
  provider, model_id, display_name, endpoint, call_kind, cap_slug,
  context_window, is_reasoning, is_active, is_curated, is_listed,
  defaults_json, limits_json, notes, source, health_status,
  consecutive_failures, updated_at
)
VALUES (
  'ollama-local-forge',
  'c3po-code:echo-abliterated-128k',
  'FORGE Local Qwen 3.6 Abliterated 27B 128K',
  'http://127.0.0.1:11437/v1',
  'openai_compat',
  'echo.qwen.local.openai_chat',
  131072,
  false,
  true,
  true,
  true,
  '{"temperature":0.2,"top_p":0.8,"max_tokens":4096,"reasoning_effort":"none"}'::jsonb,
  '{"max_output_tokens":8192,"single_active_request":true,"truncate":false,"shift":false}'::jsonb,
  'Dedicated FORGE-local loopback route. Distinct from cloud, Groq, OpenRouter, Together, and Cloudflare Qwen lanes.',
  'echo-qcoder-governed-route',
  'unknown',
  0,
  now()
)
ON CONFLICT (provider, model_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  endpoint = EXCLUDED.endpoint,
  call_kind = EXCLUDED.call_kind,
  cap_slug = EXCLUDED.cap_slug,
  context_window = EXCLUDED.context_window,
  is_reasoning = false,
  is_active = true,
  is_curated = true,
  is_listed = true,
  defaults_json = EXCLUDED.defaults_json,
  limits_json = EXCLUDED.limits_json,
  notes = EXCLUDED.notes,
  source = EXCLUDED.source,
  updated_at = now();
