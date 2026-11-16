import { expect, mock, test } from 'bun:test';
import { readRecords, writeRecords } from '@heynixie/log';
import { createConversationTask } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { buildSeeder } from '../test-utils/build-seeder';
import { startTestAPI } from '../test-utils/start-test-api';
import type { CleanupRecordSessions } from '../types';
import { readRecordForgetCheck } from './read-record-forget-check';
import { runRecordForget } from './run-record-forget';

async function setupTest() {
  const api = await startTestAPI();

  await createConversationTask(api.context);

  return {
    ...api,
    seed: buildSeeder(api),
    writeOwnerMessage: async (text: string) => {
      const [record] = await writeRecords(api.context.log, [
        {
          kind: 'owner_message',
          definitions: { snapshotHash: 'sha256:test' },
          thread: 'conversation',
          erasable: { text, spans: [] },
        },
      ]);

      invariant(record);

      return record.sequence;
    },
    readKinds: async () => {
      const entries = await readRecords(api.context.log, { afterSequence: 0 });

      return entries.map((entry) => entry.record.kind);
    },
  };
}

test('it forgets a record with no caller check and runs the session cleanup once', async () => {
  const ctx = await setupTest();
  const sequence = await ctx.writeOwnerMessage('The shed key sits under the blue pot.');

  const cleanupSessions = mock<CleanupRecordSessions>(() => Promise.resolve());

  const forgotten = await runRecordForget(
    { ...ctx.context, readSessionCleanup: () => cleanupSessions },
    { thread: 'conversation', sequence },
  );

  expect(forgotten).toStrictEqual({ status: 'forgotten', forgottenAt: expect.toBeNumber() });
  expect(cleanupSessions).toHaveBeenCalledExactlyOnceWith({ recordSequence: sequence });

  const kinds = await ctx.readKinds();

  expect(kinds).toStrictEqual([
    'task.created',
    'owner_message',
    'record.forget_started',
    'record.forgotten',
  ]);
});

test('it answers forgotten and writes nothing more when the record is already forgotten', async () => {
  const ctx = await setupTest();
  const sequence = await ctx.writeOwnerMessage('The shed key sits under the blue pot.');

  const context = { ...ctx.context, readSessionCleanup: () => () => Promise.resolve() };

  await runRecordForget(context, { thread: 'conversation', sequence });

  const before = await ctx.readKinds();
  const again = await runRecordForget(context, { thread: 'conversation', sequence });
  const after = await ctx.readKinds();

  expect(again).toStrictEqual({ status: 'forgotten', forgottenAt: expect.toBeNumber() });
  expect(after).toStrictEqual(before);
});

test('it answers not_found for a sequence that holds no record on the thread', async () => {
  const ctx = await setupTest();
  const result = await runRecordForget(ctx.context, { thread: 'conversation', sequence: 9999 });

  expect(result).toStrictEqual({ status: 'not_found' });
});

test('it answers wrong_kind with the kind of a record that carries no text of its own', async () => {
  const ctx = await setupTest();

  const [offered] = await writeRecords(ctx.context.log, [
    {
      kind: 'memory.image_offered',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { messageSequence: 1, image: 1, runID: 'run-offer' },
      erasable: { text: 'A photo of the spare key in the shed.' },
    },
  ]);

  invariant(offered);

  const result = await runRecordForget(ctx.context, {
    thread: 'conversation',
    sequence: offered.sequence,
  });

  expect(result).toStrictEqual({ status: 'wrong_kind', kind: 'memory.image_offered' });

  const kinds = await ctx.readKinds();

  expect(kinds).toStrictEqual(['task.created', 'memory.image_offered']);
});

test('it answers action_not_finished for a queued action that has not run', async () => {
  const ctx = await setupTest();
  const step = await ctx.seed.conversationStep();
  const action = await ctx.seed.action({ step: step.claim });

  const check = await readRecordForgetCheck(ctx.context.log.writer.db, {
    thread: 'conversation',
    sequence: action.queued_sequence,
  });

  expect(check).toStrictEqual({ status: 'action_not_finished' });
});

test('it reports the kind of a record that passes the check', async () => {
  const ctx = await setupTest();
  const sequence = await ctx.writeOwnerMessage('The shed key sits under the blue pot.');

  const check = await readRecordForgetCheck(ctx.context.log.writer.db, {
    thread: 'conversation',
    sequence,
  });

  expect(check).toStrictEqual({ status: 'ok', kind: 'owner_message' });
});

test('it answers not_found for a record on another thread', async () => {
  const ctx = await setupTest();
  const sequence = await ctx.writeOwnerMessage('The shed key sits under the blue pot.');

  const check = await readRecordForgetCheck(ctx.context.log.writer.db, {
    thread: 'some-task',
    sequence,
  });

  expect(check).toStrictEqual({ status: 'not_found' });
});
