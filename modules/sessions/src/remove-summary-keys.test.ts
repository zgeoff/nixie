import { expect, test } from 'bun:test';
import { readRecords, writeRecords } from '@heynixie/log';
import { removeSummaryKeys } from './remove-summary-keys';
import { startTestTasks } from './test-utils/start-test-tasks';

async function setupTest() {
  return { tasks: await startTestTasks() };
}

test('it shreds every summary on the thread', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'model.session_summarized',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { throughSequence: 0 },
      erasable: { text: 'An older summary of the harbour trip.' },
    },
    {
      kind: 'model.session_summarized',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { throughSequence: 1 },
      erasable: { text: 'The newer summary of the harbour trip.' },
    },
  ]);

  await removeSummaryKeys(ctx.tasks.context.log, 'conversation');

  const entries = await readRecords(ctx.tasks.context.log, {
    afterSequence: 0,
    kinds: ['model.session_summarized'],
  });

  expect(entries.map((entry) => entry.record.erasable.status)).toStrictEqual([
    'shredded',
    'shredded',
  ]);
});

test('it never removes the key of a reply or of another thread summary', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'model.reply',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { messageID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d002' },
      erasable: { text: 'The tide turns at four.' },
    },
    {
      kind: 'model.session_summarized',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'another-task',
      payload: { throughSequence: 0 },
      erasable: { text: 'A summary on another thread.' },
    },
  ]);

  await removeSummaryKeys(ctx.tasks.context.log, 'conversation');

  const entries = await readRecords(ctx.tasks.context.log, { afterSequence: 0 });

  expect(entries.map((entry) => entry.record.erasable.status)).toStrictEqual([
    'readable',
    'readable',
  ]);
});

test('it runs again over summaries whose keys are already gone', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'model.session_summarized',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { throughSequence: 0 },
      erasable: { text: 'A summary of the harbour trip.' },
    },
  ]);

  await removeSummaryKeys(ctx.tasks.context.log, 'conversation');
  await removeSummaryKeys(ctx.tasks.context.log, 'conversation');

  const entries = await readRecords(ctx.tasks.context.log, { afterSequence: 0 });

  expect(entries.map((entry) => entry.record.erasable.status)).toStrictEqual(['shredded']);
});
