import { AGENT_CARD_PATH, type AgentCard, type Message, type MessageSendParams, type Task } from '@a2a-js/sdk';
import { ClientFactory, JsonRpcTransportFactory, type Client } from '@a2a-js/sdk/client';

export type A2AClientSession = {
  client: Client;
  serviceBaseUrl: string;
  agentCardUrl: string;
  agentCard: AgentCard;
};

export interface IA2AClientAdapter {
  createSession(agentUrl: string): Promise<A2AClientSession>;
  getAgentCard(client: Client): Promise<AgentCard>;
  sendMessage(client: Client, params: MessageSendParams): Promise<Message | Task>;
  getTask(client: Client, taskId: string, historyLength?: number): Promise<Task>;
}

const ACCEPTED_OUTPUT_MODES = ['text', 'text/plain'];
const LEGACY_URL_SUFFIXES = [
  `/${AGENT_CARD_PATH}`,
  '/a2a/jsonrpc',
  '/a2a/rest',
  '/a2a',
] as const;

export function normalizeA2AServiceBaseUrl(agentUrl: string): string {
  const parsedUrl = new URL(agentUrl);
  const normalizedPath = trimLegacyPathSuffix(parsedUrl.pathname);

  parsedUrl.pathname = normalizedPath;
  parsedUrl.search = '';
  parsedUrl.hash = '';

  return parsedUrl.toString().replace(/\/$/, '');
}

export function buildA2AAgentCardUrl(baseUrl: string): string {
  return new URL(AGENT_CARD_PATH, `${baseUrl.replace(/\/$/, '')}/`).toString();
}

export class A2AClientAdapter implements IA2AClientAdapter {
  private readonly factory: ClientFactory;

  constructor(factory?: ClientFactory) {
    this.factory =
      factory ??
      new ClientFactory({
        transports: [new JsonRpcTransportFactory()],
        preferredTransports: ['JSONRPC'],
        clientConfig: {
          polling: true,
          acceptedOutputModes: ACCEPTED_OUTPUT_MODES,
        },
      });
  }

  async createSession(agentUrl: string): Promise<A2AClientSession> {
    const serviceBaseUrl = normalizeA2AServiceBaseUrl(agentUrl);
    const client = await this.factory.createFromUrl(serviceBaseUrl);
    const agentCard = await client.getAgentCard();

    return {
      client,
      serviceBaseUrl,
      agentCardUrl: buildA2AAgentCardUrl(serviceBaseUrl),
      agentCard,
    };
  }

  async getAgentCard(client: Client): Promise<AgentCard> {
    return client.getAgentCard();
  }

  async sendMessage(client: Client, params: MessageSendParams): Promise<Message | Task> {
    return client.sendMessage(params);
  }

  async getTask(client: Client, taskId: string, historyLength: number = 20): Promise<Task> {
    return client.getTask({
      id: taskId,
      historyLength,
    });
  }
}

function trimLegacyPathSuffix(pathname: string): string {
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
