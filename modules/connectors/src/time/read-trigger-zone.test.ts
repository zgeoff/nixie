import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { startTestLog } from '../test-utils/start-test-log';
import { readTriggerZone } from './read-trigger-zone';

async function setupTest() {
  const definitions = { snapshotHash: 'sha256:test' };

  const log = await startTestLog();

  const written = await writeRecords(log, [
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

  return {
    log,
    firstSequence: written[0]?.sequence ?? 0,
    secondSequence: written[1]?.sequence ?? 0,
  };
}

test('it gives a schedule its own IANA zone', async () => {
  const ctx = await setupTest();

  const zone = await readTriggerZone(
    ctx.log,
    { schedule: { every: 'day', at: '06:30', zone: 'Europe/Paris', catchUp: 'once' } },
    ctx.secondSequence + 1,
    'Australia/Sydney',
  );

  expect(zone).toBe('Europe/Paris');
});

test('it gives an owner schedule the zone of the newest message before the fire', async () => {
  const ctx = await setupTest();

  const zone = await readTriggerZone(
    ctx.log,
    { schedule: { every: 'day', at: '06:30', zone: 'owner', catchUp: 'once' } },
    ctx.secondSequence,
    'Australia/Sydney',
  );

  expect(zone).toBe('Asia/Tokyo');
});

test('it gives an at trigger the owner zone before the fire', async () => {
  const ctx = await setupTest();

  const zone = await readTriggerZone(
    ctx.log,
    { at: '2026-06-04T06:30:00+10:00' },
    ctx.secondSequence + 1,
    'Australia/Sydney',
  );

  expect(zone).toBe('Europe/London');
});

test('it gives an at trigger the default zone when no earlier message holds one', async () => {
  const ctx = await setupTest();

  const zone = await readTriggerZone(
    ctx.log,
    { at: '2026-06-04T06:30:00+10:00' },
    ctx.firstSequence,
    'Australia/Sydney',
  );

  expect(zone).toBe('Australia/Sydney');
});
