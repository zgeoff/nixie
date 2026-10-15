import { expect, test } from 'bun:test';
import { removeRecordKey, writeRecords } from '@heynixie/log';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';
import { findSessionSummary } from './find-session-summary';
import { startTestTasks } from './test-utils/start-test-tasks';

async function setupTest() {
  return { tasks: await startTestTasks() };
}

test('it finds the newest summary with its sequence, the sequence it covers and its text', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.tasks.context.log, [
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

  const summary = await findSessionSummary(ctx.tasks.context, 'conversation');

  expect(summary).toStrictEqual({
    sequence: 2,
    throughSequence: 1,
    text: 'The newer summary.',
  });
});

test('it passes over a summary whose key is gone to the newest one still readable', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.tasks.context.log, [
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

  const keys = await sql<{ key_id: string }>`select key_id from records
    where sequence = 2`.execute(ctx.tasks.writer.db);

  const [key] = keys.rows;

  invariant(key);

  await removeRecordKey(ctx.tasks.context.log, key.key_id);

  const summary = await findSessionSummary(ctx.tasks.context, 'conversation');

  expect(summary).toStrictEqual({
    sequence: 1,
    throughSequence: 0,
    text: 'An older summary.',
  });
});

test('it finds none on a thread with no summary', async () => {
  const ctx = await setupTest();
  const summary = await findSessionSummary(ctx.tasks.context, 'conversation');

  expect(summary).toBeNull();
});
