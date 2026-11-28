import { expect, test } from 'bun:test';
import type { StatusEvent } from '@heynixie/connections';
import { buildEventRegistry, readEventsBlock } from '@heynixie/sessions';
import { buildConnectionStatusKind } from './build-connection-status-kind';

function setupTest(events: readonly StatusEvent[]) {
  const registry = buildEventRegistry([buildConnectionStatusKind(() => Promise.resolve(events))]);

  return {
    read: () =>
      readEventsBlock(
        registry,
        { after: 0, through: 100 },
        { ownerName: 'Avery', timeZone: 'UTC' },
      ),
  };
}

test('it lists each status event of a connection after its time, oldest first', async () => {
  const who = {
    connection: 'k3x9m2p7qa',
    connector: 'google',
    label: 'Work',
    account: 'sam@example.com',
  };

  const ctx = setupTest([
    {
      kind: 'returned',
      sequence: 9,
      atMs: Date.parse('2026-11-20T10:00:00Z'),
      who,
      failedCalls: 2,
      skippedRuns: 0,
    },
    {
      kind: 'changed',
      sequence: 4,
      atMs: Date.parse('2026-11-20T09:00:00Z'),
      who,
      status: 'failing',
      reason: 'no_answer',
      lastSuccessAtMs: null,
      removedTools: [],
    },
  ]);

  const block = await ctx.read();

  expect(block.text?.split('\n').slice(1)).toStrictEqual([
    '- Fri 20 Nov, 09:00, UTC · The google connection "Work" (sam@example.com) is now failing (no_answer) as of Fri 20 Nov, 09:00, UTC. Last success none yet. Reconnect it in Settings → Connections.',
    '- Fri 20 Nov, 10:00, UTC · The google connection "Work" (sam@example.com) is active again as of Fri 20 Nov, 10:00, UTC. 2 calls failed during the break.',
  ]);
});

test('it lists no block while no connection has an event', async () => {
  const ctx = setupTest([]);

  const block = await ctx.read();

  expect(block.text).toBeNull();
});

test('it lists every connection event of a block that holds more than the cap, so a turn never moves past one', async () => {
  const who = {
    connection: 'k3x9m2p7qa',
    connector: 'google',
    label: 'Work',
    account: 'sam@example.com',
  };

  const ctx = setupTest(
    Array.from({ length: 11 }, (_, index) => ({
      kind: 'lasted' as const,
      sequence: index + 1,
      atMs: Date.parse('2026-11-20T09:00:00Z') + index * 60_000,
      who,
      sinceMs: Date.parse('2026-11-18T09:00:00Z'),
    })),
  );

  const block = await ctx.read();

  expect([block.text?.split('\n').length, block.text]).toStrictEqual([
    12,
    expect.not.stringContaining('more'),
  ]);
});
