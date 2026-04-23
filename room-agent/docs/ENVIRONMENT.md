# Environment Variables

This page collects every environment variable referenced by room-agent startup code, helper scripts, and example files.

## Runtime variables read by the service

These are consumed directly by [app/server.py](../app/server.py):

- `ROOM_AGENT_HOST`: bind host for the HTTP service. Default: `127.0.0.1`
- `ROOM_AGENT_PORT`: bind port for the HTTP service. Default: `10000`

The same values can be passed explicitly with `serve --host ... --port ...`; CLI flags take precedence over environment variables.

For phone-based testing, bind to `0.0.0.0` so the service listens on the LAN interface:

```bash
cd room-agent
.venv/bin/serve \
  --host 0.0.0.0 \
  --port 10000 \
  --config-path config/examples/room_agent.example.yaml \
  --llm-config-path /path/to/private-llm.yaml
```

The public A2A URL advertised to Personal Agent is auto-detected from the active LAN IP and `ROOM_AGENT_PORT` / `--port`. Set `gateway.agent_host` only when the deployment needs a fixed domain, reverse proxy, tunnel, static IP override, or auto-detection picks the wrong network interface.

## Launch-time variables used by the shell wrapper

These are consumed by [server.sh](../server.sh):

- `ROOM_AGENT_CONFIG_PATH`: path to the room-agent YAML config. Default: `./tests/fixtures/agent-zyp.yaml`
- `ROOM_AGENT_LLM_CONFIG_PATH`: path to the LLM YAML config. Required

## Example provider credential variables

These appear in [.env.example](../.env.example) as reference values for local development:

- `OPENAI_API_KEY`
- `DASHSCOPE_API_KEY`
- `DASHSCOPE_INTL_API_KEY`
- `OPENAI_BASE_URL`
- `DASHSCOPE_BASE_URL`

## Local tooling variable

- `UV_CACHE_DIR`: used when running `uv` in Codex or other sandboxed environments to avoid cache permission issues. This is a tooling convenience, not a room-agent runtime dependency.

## Test-only switch

- `__RA_ABALATION_TEST`: when set, `graph/nodes/tool_selection.py` bypasses the model and selects all candidate tools. This is a test-only escape hatch and should not be used in normal runtime.

## Qwen prompt patch switch

- `__RA_QWEN_NOTHINK`: when set to a truthy value (`1`, `true`, `yes`, `on`), Room Agent appends `/nothink` to selected prompt inputs via `graph/utils/prompt_patch.py`. Leave unset for other models to avoid prompt pollution.
