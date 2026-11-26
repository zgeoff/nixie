import { expect, test } from 'bun:test';
import { formatServerHealth } from './format-server-health';
import type { McpServer } from './types';

function setupTest() {
  const server: McpServer = {
    server: 'tracker',
    state: 'added',
    signIn: 'ok',
    health: 'healthy',
    lastError: null,
    nextTryAtMs: null,
    url: null,
    proposalID: null,
    tools: [],
  };

  return { server };
}

test('it words a healthy server as Healthy', () => {
  const ctx = setupTest();

  expect(formatServerHealth(ctx.server)).toBe('Healthy');
});

test('it words an unhealthy server with its last error and next try', () => {
  const ctx = setupTest();

  expect(
    formatServerHealth({
      ...ctx.server,
      health: 'unhealthy',
      lastError: 'timeout',
      nextTryAtMs: Date.UTC(2026, 0, 1, 14, 5),
    }),
  ).toBe('Unreachable (timeout), next try 14:05 UTC');
});
