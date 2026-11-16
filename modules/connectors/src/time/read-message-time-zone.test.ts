import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { startTestLog } from '../test-utils/start-test-log';
import { readMessageTimeZone } from './read-message-time-zone';

async function setupTest() {
  return { log: await startTestLog() };
}

test('it finds the zone of the newest owner message that carries one, in any thread', async () => {
  const definitions = { snapshotHash: 'sha256:test' };

  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions,
      thread: 'conversation',
      payload: { timeZone: 'Asia/Tokyo' },
    },
    {
      kind: 'owner_message',
      definitions,
      thread: 'trip-plans',
      payload: { timeZone: 'Europe/London' },
    },
    { kind: 'owner_message', definitions, thread: 'conversation', payload: {} },
    {
      kind: 'action.outcome',
      definitions,
      thread: 'conversation',
      payload: { timeZone: 'America/Lima' },
    },
  ]);

  const zone = await readMessageTimeZone(ctx.log);

  expect(zone).toBe('Europe/London');
});

test('it finds no zone when no owner message carries one', async () => {
  const definitions = { snapshotHash: 'sha256:test' };

  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    { kind: 'owner_message', definitions, thread: 'conversation', payload: {} },
  ]);

  const zone = await readMessageTimeZone(ctx.log);

  expect(zone).toBeNull();
});

test('it finds the zone of the newest owner message before a sequence', async () => {
  const definitions = { snapshotHash: 'sha256:test' };

  const ctx = await setupTest();

  const written = await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions,
      thread: 'conversation',
      payload: { timeZone: 'Asia/Tokyo' },
    },
    {
      kind: 'owner_message',
      definitions,
      thread: 'conversation',
      payload: { timeZone: 'Europe/London' },
    },
  ]);

  const second = written[1]?.sequence;

  invariant(second !== undefined);

  const zone = await readMessageTimeZone(ctx.log, second);

  expect(zone).toBe('Asia/Tokyo');
});
