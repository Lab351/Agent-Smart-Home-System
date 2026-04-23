#!/usr/bin/env node

import { AGENT_CARD_PATH } from '@a2a-js/sdk';
import { ClientFactory, JsonRpcTransportFactory } from '@a2a-js/sdk/client';

const ACCEPTED_OUTPUT_MODES = ['text', 'text/plain'];
const DEFAULT_URL = 'http://192.168.0.221:10000/';
const DEFAULT_TIMEOUT_MS = 10_000;
const LEGACY_URL_SUFFIXES = [
  `/${AGENT_CARD_PATH}`,
  '/a2a/jsonrpc',
  '/a2a/rest',
  '/a2a',
];

const defaults = {
  url: DEFAULT_URL,
  cardPath: undefined,
  roomId: 'livingroom',
  roomAgentId: 'room-agent-livingroom',
  sourceAgent: 'personal-agent-user1',
  utterance: '打开客厅主灯亮度调到80',
  targetDevice: 'main_light',
  action: 'turn_on',
  timeoutMs: DEFAULT_TIMEOUT_MS,
};

async function main() {
  const cli = parseArgs(process.argv.slice(2));

  if (cli.help) {
    printHelp();
    return;
  }

  const serviceBaseUrl = normalizeA2AServiceBaseUrl(cli.url);
  const agentCardUrl = buildA2AAgentCardUrl(serviceBaseUrl, cli.cardPath);

  printStep('URL');
  console.log(`input:           ${cli.url}`);
  console.log(`serviceBaseUrl:  ${serviceBaseUrl}`);
  console.log(`agentCardUrl:    ${agentCardUrl}`);
  console.log(`command:         ${cli.command}`);

  let client;
  let agentCard;

  try {
    printStep('Agent Card');
    const factory = new ClientFactory({
      transports: [
        new JsonRpcTransportFactory({
          fetchImpl: createTimeoutFetch(cli.timeoutMs),
        }),
      ],
      preferredTransports: ['JSONRPC'],
      clientConfig: {
        polling: true,
        acceptedOutputModes: ACCEPTED_OUTPUT_MODES,
      },
    });

    client = await factory.createFromUrl(serviceBaseUrl, cli.cardPath);
    agentCard = await client.getAgentCard();
    printAgentCardSummary(agentCard);

    if (cli.verbose || cli.command === 'card') {
      printJson('agentCard', agentCard);
    }
  } catch (error) {
    printFailure(
      'agent-card 探活失败',
      error,
      [
        `确认 room-agent 已启动，并监听 ${new URL(serviceBaseUrl).host}。`,
        `确认 ${agentCardUrl} 能从当前机器访问。`,
        '如果 Python 脚本用 127.0.0.1 可通，但 LAN IP 不通，通常是 room-agent 只绑定了 127.0.0.1；手机联调需要 ROOM_AGENT_HOST=0.0.0.0。',
        '如果手机能访问但本机不能访问，请继续用应用内链路做真机验证。',
      ]
    );
    process.exitCode = 1;
    return;
  }

  if (cli.probeOnly || cli.command === 'card') {
    printStep('Done');
    console.log('已完成 agent-card 探活，未发送控制请求。');
    return;
  }

  if (cli.command === 'get-task') {
    try {
      printStep('tasks/get');
      const task = await client.getTask({
        id: cli.taskId,
        historyLength: cli.historyLength,
      });
      printA2AResultSummary(task);

      if (cli.verbose) {
        printJson('task', task);
      }
    } catch (error) {
      printFailure(
        'tasks/get 查询失败',
        error,
        [
          `确认 task id 存在: ${cli.taskId}`,
          `确认 agent-card.url 是可访问的 JSON-RPC endpoint。当前 agent-card.url: ${agentCard?.url ?? '(unknown)'}`,
        ]
      );
      process.exitCode = 1;
    }
    return;
  }

  try {
    printStep('message/send');
    const metadata = buildControlMetadata(cli);
    const sendParams = {
      configuration: {
        acceptedOutputModes: ACCEPTED_OUTPUT_MODES,
        blocking: false,
        historyLength: cli.historyLength,
      },
      message: {
        kind: 'message',
        messageId: generateId('demo-msg'),
        role: 'user',
        contextId: cli.contextId,
        taskId: cli.taskId,
        metadata,
        parts: [
          {
            kind: 'text',
            text: cli.utterance,
            metadata,
          },
        ],
      },
      metadata,
    };

    console.log(`utterance:       ${cli.utterance}`);
    console.log(`roomId:          ${cli.roomId}`);
    console.log(`roomAgentId:     ${cli.roomAgentId}`);
    console.log(`targetDevice:    ${cli.targetDevice}`);
    console.log(`action:          ${cli.action}`);
    console.log(`parameters:      ${JSON.stringify(cli.params)}`);
    console.log(`taskId:          ${cli.taskId ?? '(none)'}`);
    console.log(`contextId:       ${cli.contextId ?? '(none)'}`);
    console.log(`historyLength:   ${cli.historyLength}`);

    const result = await client.sendMessage(sendParams);
    printA2AResultSummary(result);

    if (cli.verbose) {
      printJson('sendResult', result);
    }
  } catch (error) {
    printFailure(
      'message/send 发送失败',
      error,
      [
        `确认 agent-card.url 是可访问的 JSON-RPC endpoint。当前 agent-card.url: ${agentCard?.url ?? '(unknown)'}`,
        '确认 room-agent 支持 message/send，并能接受 text/plain 输出模式。',
        '如果 agent-card 成功但 message/send 失败，优先查看 room-agent 服务端日志。',
      ]
    );
    process.exitCode = 1;
  }
}

function parseArgs(args) {
  const result = {
    ...defaults,
    params: { brightness: 80 },
    command: 'send',
    taskId: undefined,
    contextId: undefined,
    historyLength: 20,
    probeOnly: false,
    verbose: false,
    help: false,
  };

  const restArgs = [...args];
  const first = restArgs[0];
  if (first === 'card' || first === 'send' || first === 'get-task') {
    result.command = first;
    restArgs.shift();

    if (first === 'get-task') {
      const taskId = restArgs.shift();
      if (!taskId || taskId.startsWith('--')) {
        throw new Error('Missing task id for get-task command.');
      }
      result.taskId = taskId;
    } else if (first === 'send' && restArgs[0] && !restArgs[0].startsWith('--')) {
      result.utterance = restArgs.shift();
    }
  }

  for (let index = 0; index < restArgs.length; index += 1) {
    const arg = restArgs[index];

    if (arg === '--help' || arg === '-h') {
      result.help = true;
      continue;
    }

    if (arg === '--probe-only') {
      result.probeOnly = true;
      continue;
    }

    if (arg === '--verbose') {
      result.verbose = true;
      continue;
    }

    const [rawKey, inlineValue] = arg.startsWith('--') ? arg.slice(2).split(/=(.*)/s, 2) : [];
    if (!rawKey) {
      throw new Error(`Unknown argument: ${arg}`);
    }

    const value = inlineValue ?? restArgs[index + 1];
    if (value == null || value.startsWith('--')) {
      throw new Error(`Missing value for --${rawKey}`);
    }

    if (inlineValue == null) {
      index += 1;
    }

    switch (rawKey) {
      case 'url':
        result.url = value;
        break;
      case 'card-path':
        result.cardPath = value;
        break;
      case 'room-id':
        result.roomId = value;
        break;
      case 'room-agent-id':
        result.roomAgentId = value;
        break;
      case 'source-agent':
        result.sourceAgent = value;
        break;
      case 'utterance':
        result.utterance = value;
        break;
      case 'target-device':
        result.targetDevice = value;
        break;
      case 'action':
        result.action = value;
        break;
      case 'timeout-ms':
        result.timeoutMs = parseTimeout(value);
        break;
      case 'task-id':
        result.taskId = value;
        break;
      case 'context-id':
        result.contextId = value;
        break;
      case 'history-length':
        result.historyLength = parseHistoryLength(value);
        break;
      case 'param':
        applyParam(result.params, value);
        break;
      default:
        throw new Error(`Unknown argument: --${rawKey}`);
    }
  }

  return result;
}

function parseTimeout(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid --timeout-ms value: ${value}`);
  }

  return parsed;
}

function parseHistoryLength(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid --history-length value: ${value}`);
  }

  return parsed;
}

function applyParam(params, value) {
  const separatorIndex = value.indexOf('=');
  if (separatorIndex <= 0) {
    throw new Error(`Invalid --param value: ${value}. Expected key=value.`);
  }

  const key = value.slice(0, separatorIndex).trim();
  const rawValue = value.slice(separatorIndex + 1).trim();
  if (!key) {
    throw new Error(`Invalid --param value: ${value}. Parameter key is empty.`);
  }

  params[key] = parseParamValue(rawValue);
}

function parseParamValue(value) {
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  if (value === 'null') {
    return null;
  }
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }
  if (/^[{["]/.test(value)) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  return value;
}

function normalizeA2AServiceBaseUrl(agentUrl) {
  const parsedUrl = new URL(agentUrl);
  const normalizedPath = trimLegacyPathSuffix(parsedUrl.pathname);

  parsedUrl.pathname = normalizedPath;
  parsedUrl.search = '';
  parsedUrl.hash = '';

  return parsedUrl.toString().replace(/\/$/, '');
}

function trimLegacyPathSuffix(pathname) {
  const withoutTrailingSlash = pathname.replace(/\/+$/, '');

  for (const suffix of LEGACY_URL_SUFFIXES) {
    if (
      withoutTrailingSlash === suffix ||
      withoutTrailingSlash.endsWith(suffix)
    ) {
      const nextPath = withoutTrailingSlash.slice(0, -suffix.length);
      return nextPath || '/';
    }
  }

  return withoutTrailingSlash || '/';
}

function buildA2AAgentCardUrl(baseUrl, cardPath) {
  return new URL(cardPath ?? AGENT_CARD_PATH, `${baseUrl.replace(/\/$/, '')}/`).toString();
}

function createTimeoutFetch(timeoutMs) {
  return async (input, init = {}) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(input, {
        ...init,
        signal: init.signal ?? controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  };
}

function buildControlMetadata(cli) {
  return {
    controlRequest: {
      roomId: cli.roomId,
      roomAgentId: cli.roomAgentId,
      sourceAgent: cli.sourceAgent,
      targetDevice: cli.targetDevice,
      action: cli.action,
      parameters: cli.params,
    },
  };
}

function generateId(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function printStep(title) {
  console.log(`\n== ${title} ==`);
}

function printAgentCardSummary(agentCard) {
  console.log(`name:            ${agentCard.name ?? '(missing)'}`);
  console.log(`url:             ${agentCard.url ?? '(missing)'}`);
  console.log(`version:         ${agentCard.version ?? '(missing)'}`);
  console.log(`protocolVersion: ${agentCard.protocolVersion ?? '(missing)'}`);
  console.log(`preferred:       ${agentCard.preferredTransport ?? 'JSONRPC(default)'}`);
  console.log(`skills:          ${Array.isArray(agentCard.skills) ? agentCard.skills.length : 0}`);
}

function printA2AResultSummary(result) {
  if (!result || typeof result !== 'object') {
    console.log(`result:          ${String(result)}`);
    return;
  }

  console.log(`kind:            ${result.kind ?? '(missing)'}`);

  if (result.kind === 'message') {
    console.log(`messageId:       ${result.messageId ?? '(missing)'}`);
    console.log(`contextId:       ${result.contextId ?? '(none)'}`);
    console.log(`text:            ${extractText(result.parts) || '(no text part)'}`);
    return;
  }

  if (result.kind === 'task') {
    console.log(`taskId:          ${result.id ?? '(missing)'}`);
    console.log(`contextId:       ${result.contextId ?? '(none)'}`);
    console.log(`state:           ${result.status?.state ?? '(missing)'}`);
    console.log(`detail:          ${extractTaskDetail(result) || '(no detail)'}`);
    return;
  }

  printJson('result', result);
}

function extractTaskDetail(task) {
  const fromStatus = extractText(task.status?.message?.parts);
  if (fromStatus) {
    return fromStatus;
  }

  const artifacts = Array.isArray(task.artifacts) ? task.artifacts : [];
  for (let index = artifacts.length - 1; index >= 0; index -= 1) {
    const text = extractText(artifacts[index]?.parts);
    if (text) {
      return text;
    }
  }

  return '';
}

function extractText(parts) {
  if (!Array.isArray(parts)) {
    return '';
  }

  return parts
    .map(part => {
      if (!part || typeof part !== 'object') {
        return '';
      }
      if (part.kind === 'text' && typeof part.text === 'string') {
        return part.text.trim();
      }
      if (part.root && typeof part.root === 'object' && typeof part.root.text === 'string') {
        return part.root.text.trim();
      }
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

function printJson(label, value) {
  console.log(`${label}:`);
  console.log(JSON.stringify(value, null, 2));
}

function printFailure(title, error, hints) {
  console.error(`\n[FAIL] ${title}`);
  console.error(`error: ${formatError(error)}`);
  console.error('hints:');
  for (const hint of hints) {
    console.error(`- ${hint}`);
  }
}

function formatError(error) {
  if (error instanceof Error) {
    return error.cause instanceof Error
      ? `${error.message}; cause: ${error.cause.message}`
      : error.message;
  }

  return String(error);
}

function printHelp() {
  console.log(`A2A control channel demo

Usage:
  npm run demo:a2a -- [card|send|get-task] [message|task_id] [options]

Options:
  --url <url>                 Room-agent A2A base URL. Default: ${DEFAULT_URL}
  --card-path <path>          Agent-card path. Defaults to SDK well-known path.
  --room-id <id>              Room id. Default: ${defaults.roomId}
  --room-agent-id <id>        Room agent id. Default: ${defaults.roomAgentId}
  --source-agent <id>         Source personal agent id. Default: ${defaults.sourceAgent}
  --utterance <text>          Text sent as the A2A user message.
  --target-device <id>        Target device id. Default: ${defaults.targetDevice}
  --action <action>           Control action. Default: ${defaults.action}
  --param <key=value>         Control parameter. Can be repeated.
  --task-id <id>              Existing task id for send continuation.
  --context-id <id>           Existing context id for send continuation.
  --history-length <number>   historyLength for message/send or tasks/get. Default: 20
  --timeout-ms <ms>           HTTP timeout per request. Default: ${DEFAULT_TIMEOUT_MS}
  --probe-only                Only fetch agent-card; do not send message/send.
  --verbose                   Print full agent-card and send result JSON.
  --help                      Show this help.

Examples:
  npm run demo:a2a -- card --url http://127.0.0.1:10000/
  npm run demo:a2a -- send "你好" --url http://127.0.0.1:10000/
  npm run demo:a2a -- get-task <task_id> --url http://127.0.0.1:10000/
  npm run demo:a2a -- --url http://192.168.0.221:10000/
  npm run demo:a2a -- --probe-only --verbose
  npm run demo:a2a -- --param brightness=60 --param mode=warm
`);
}

main().catch(error => {
  printFailure('demo 执行失败', error, ['检查命令参数是否正确。']);
  process.exitCode = 1;
});
