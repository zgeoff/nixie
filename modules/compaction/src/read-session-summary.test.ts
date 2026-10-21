import { expect, test } from 'bun:test';
import { removeRecordKey, writeRecords } from '@heynixie/log';
import { startTestLog } from '@heynixie/log/test-utils';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { readSessionSummary } from './read-session-summary';

async function setupTest() {
  return { log: await startTestLog() };
}

test('it finds the newest summary with its sequence, the sequence it covers and its text', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log.log, [
    {
      kind: 'model.session_summarized',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { throughSequence: 0 },
      erasable: { text: 'An older summary.' },
    },
    {
      kind: 'model.session_summarized',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { throughSequence: 1 },
      erasable: { text: 'The newer summary.' },
    },
  ]);

  const summary = await readSessionSummary(ctx.log, 'conversation');

  expect(summary).toStrictEqual({
    sequence: 2,
    throughSequence: 1,
    text: 'The newer summary.',
  });
});

test('it passes over a summary whose key is gone to the newest one still readable', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log.log, [
    {
      kind: 'model.session_summarized',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { throughSequence: 0 },
      erasable: { text: 'An older summary.' },
    },
    {
      kind: 'model.session_summarized',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { throughSequence: 1 },
      erasable: { text: 'The newer summary.' },
    },
  ]);

  const keys = await sql`select key_id from records where sequence = 2`.execute(ctx.log.writer.db);

  const [key] = z.array(z.object({ key_id: z.string() })).parse(keys.rows);

  invariant(key);

  await removeRecordKey(ctx.log.log, key.key_id);

  const summary = await readSessionSummary(ctx.log, 'conversation');

  expect(summary).toStrictEqual({
    sequence: 1,
    throughSequence: 0,
    text: 'An older summary.',
  });
});

test('it finds none on a thread with no summary', async () => {
  const ctx = await setupTest();
  const summary = await readSessionSummary(ctx.log, 'conversation');

  expect(summary).toBeNull();
});
