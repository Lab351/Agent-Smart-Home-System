import {
  buildA2AAgentCardUrl,
  normalizeA2AServiceBaseUrl,
} from '@/services/transports/a2a-client-adapter';

describe('a2a-client-adapter helpers', () => {
  it.each([
    ['http://127.0.0.1:8001/', 'http://127.0.0.1:8001'],
    ['http://127.0.0.1:8001/a2a', 'http://127.0.0.1:8001'],
    ['http://127.0.0.1:8001/a2a/jsonrpc', 'http://127.0.0.1:8001'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeA2AServiceBaseUrl(input)).toBe(expected);
    expect(buildA2AAgentCardUrl(expected)).toBe(`${expected}/.well-known/agent-card.json`);
  });
});
