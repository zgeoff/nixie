import { expect, test } from 'bun:test';
import type { AttentionConnection } from '@heynixie/connections';
import { readJobConnectionStatus } from './read-job-connection-status';

function setupTest() {
  const failing: AttentionConnection = {
    connection: 'k3x9m2p7qa',
    connector: 'google',
    label: 'Work',
    account: 'sam@example.com',
    status: 'failing',
    reason: 'no_answer',
    sinceMs: Date.parse('2026-11-20T09:00:00Z'),
    lastSuccessAtMs: null,
    removedTools: [],
  };

  const asked: (ReadonlySet<string> | undefined)[] = [];

  return {
    failing,
    asked,
    read: (connections: readonly AttentionConnection[], pinned: readonly string[]) =>
      readJobConnectionStatus(
        {
          readAttention: (scope) => {
            asked.push(scope);

            return Promise.resolve([...connections]);
          },
        },
        new Set(pinned),
        'UTC',
      ),
  };
}

test('it reads only the connections the job run is pinned to', async () => {
  const ctx = setupTest();

  await ctx.read([], ['k3x9m2p7qa']);

  expect(ctx.asked).toStrictEqual([new Set(['k3x9m2p7qa'])]);
});

test('it reads nothing while every pinned connection works', async () => {
  const ctx = setupTest();

  const text = await ctx.read([], ['k3x9m2p7qa']);

  expect(text).toBe('');
});

test('it lists a pinned connection that fails, with no model credential', async () => {
  const ctx = setupTest();

  const text = await ctx.read([ctx.failing], ['k3x9m2p7qa']);

  expect(text).toInclude('google connection "Work" (sam@example.com): failing (no_answer)');
  expect(text).not.toInclude('model credential');
});
