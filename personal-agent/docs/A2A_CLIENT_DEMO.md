# Personal Agent A2A client demo

This demo is intentionally small. It gives the Quick App side a minimal A2A
HTTP JSON-RPC client path before the real `a2a-python` server is ready.

## What it includes

- `src/services/A2AClientDemoService.js`
  - Fetch agent card from `/.well-known/agent-card.json`
  - Send a text message with `message/send`
  - Poll a task with `tasks/get`
- `tests/demo/mock_a2a_server.py`
  - Local mock A2A server
  - Supports `message/send` and `tasks/get`

## Why this exists

The current `personal-agent` communication path still depends on MQTT for:

- Sending control commands to room agents
- Subscribing to room state updates
- Querying room capability descriptions

The A2A demo only covers the request-response path first. That is enough to
validate:

- Quick App `system.fetch` can talk to an A2A server
- Agent Card discovery works
- JSON-RPC payloads are shaped correctly
- Long-running tasks can be handled with polling

## State split in personal-agent

There are two different kinds of state in the app:

- Local personal state
  - UI flags like `statusText`, `isRecording`, `isConnected`
  - Personal context like `conversationHistory`
  - Local room binding like `currentRoomId` and `currentRoomName`
- Remote environment state
  - Room device state from room agent `.../state`
  - Room capability description from room agent `.../description`
  - Home-level state if later subscribed from a central agent

Only the second category is tied to MQTT today.

## Local demo usage

Start the mock server:

```bash
python3 tests/demo/mock_a2a_server.py --host 127.0.0.1 --port 4040
```

Then point the Quick App demo client to:

- Agent Card: `http://127.0.0.1:4040/.well-known/agent-card.json`
- Agent URL: `http://127.0.0.1:4040/a2a/jsonrpc`

Suggested smoke test order:

1. Fetch the agent card
2. Send `"Turn on the bedroom light"`
3. Read the task state
4. Send `"slow turn on the bedroom light"` and poll until `completed`

## Migration implication

This demo supports the first migration step:

- Replace command request path with A2A

It does not replace the state subscription path yet:

- Room state updates
- Capability description updates
- Any continuous push feed

Those should move either to A2A polling, A2A streaming, or a temporary hybrid
mode depending on what the Quick App runtime can support reliably.
