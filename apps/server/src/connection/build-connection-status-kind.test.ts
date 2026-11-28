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
    },
    {
      kind: 'changed',
      sequence: 4,
      atMs: Date.parse('2026-11-20T09:00:00Z'),
      who,
      status: 'failing',
      reason: 'no_answer',
    },
  ]);

  const block = await ctx.read();

  expect(block.text?.split('\n').slice(1)).toStrictEqual([
    '- Fri 20 Nov, 09:00, UTC · The google connection "Work" (sam@example.com) is now failing (no_answer) as of Fri 20 Nov, 09:00, UTC.',
    '- Fri 20 Nov, 10:00, UTC · The google connection "Work" (sam@example.com) is active again as of Fri 20 Nov, 10:00, UTC. 2 calls failed during the break.',
  ]);
});

test('it lists no block while no connection has an event', async () => {
  const ctx = setupTest([]);

  const block = await ctx.read();

  expect(block.text).toBeNull();
});
