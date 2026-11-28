import { expect, test } from 'bun:test';
import { readRecords, writeRecords } from '@heynixie/log';
import { createConversationTask } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { createDeviceSession } from '../test-utils/create-device-session';
import { startTestAPI } from '../test-utils/start-test-api';
import { readRecordForgetProgress } from './read-record-forget-progress';
import { writeRecordForget } from './write-record-forget';

async function setupTest() {
  const api = await startTestAPI();

  await createConversationTask(api.context);

  const laptop = await createDeviceSession(api.context, 'laptop');

  return {
    ...api,
    forget: (sequence: number) =>
      writeRecordForget(api.context, laptop.caller, {
        clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
        thread: 'conversation',
        sequence,
      }),
    readForgottenSequences: async () => {
      const entries = await readRecords(api.context.log, {
        afterSequence: 0,
        kinds: ['erasure.finished'],
      });

      return entries.map((entry) => entry.record.sequence);
    },
  };
}

test('it reads the forget of a record that has not finished its cleanup as deleting', async () => {
  const ctx = await setupTest();

  const [result] = await writeRecords(ctx.context.log, [
    {
      kind: 'tool_result',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { page: 'The locker code is 2291.' },
    },
  ]);

  invariant(result);

  const progress = await readRecordForgetProgress(ctx.context, result.sequence);

  expect(progress).toStrictEqual({ stage: 'deleting' });
});

test('it reads a finished forget of a record with a key as forgotten at the sequence of its erasure.finished', async () => {
  const ctx = await setupTest();

  const [result] = await writeRecords(ctx.context.log, [
    {
      kind: 'tool_result',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { page: 'The locker code is 2291.' },
    },
  ]);

  invariant(result);

  await ctx.forget(result.sequence);

  const [forgotten] = await ctx.readForgottenSequences();

  invariant(typeof forgotten === 'number' && forgotten > 0);

  const progress = await readRecordForgetProgress(ctx.context, result.sequence);

  expect(progress).toStrictEqual({ stage: 'forgotten', sequence: forgotten });
});

test('it reads a finished forget of a record with no key as forgotten with no sequence', async () => {
  const ctx = await setupTest();

  const [result] = await writeRecords(ctx.context.log, [
    {
      kind: 'tool_result',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
    },
  ]);

  invariant(result);

  await ctx.forget(result.sequence);

  const progress = await readRecordForgetProgress(ctx.context, result.sequence);

  expect(progress).toStrictEqual({ stage: 'forgotten', sequence: null });
});
