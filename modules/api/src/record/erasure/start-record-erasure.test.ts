import { expect, mock, test } from 'bun:test';
import { readImageEntry } from '@heynixie/connectors';
import { encodeTestImage, seedImage } from '@heynixie/connectors/test-utils';
import type { ErasureFaultPoint } from '@heynixie/log';
import { readRecords, writeRecords } from '@heynixie/log';
import { createConversationTask } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { seedTaskStartCall, seedUnansweredStartCall } from '../../test-utils/seed-task-start-call';
import { startTestAPI } from '../../test-utils/start-test-api';
import type { CleanupRecordSessions } from '../../types';
import { runRecordForget } from '../run-record-forget';

async function setupTest() {
  const api = await startTestAPI();

  await createConversationTask(api.context);

  return {
    ...api,
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
    readErasureKinds: async () => {
      const entries = await readRecords(api.context.log, {
        afterSequence: 0,
        kinds: ['erasure.started', 'erasure.finished'],
      });

      return entries.map((entry) => [entry.record.kind, entry.record.payload['kind']]);
    },
    readStatus: async (sequence: number) => {
      const [entry] = await readRecords(api.context.log, {
        afterSequence: sequence - 1,
        sequences: [sequence],
      });

      return entry?.record.erasable.status;
    },
  };
}

test('it writes erasure.started and erasure.finished for a record, and no record of the old kinds', async () => {
  const ctx = await setupTest();
  const sequence = await ctx.writeOwnerMessage('The shed key sits under the blue pot.');

  await runRecordForget(ctx.context, { thread: 'conversation', sequence });

  const entries = await readRecords(ctx.context.log, { afterSequence: 0 });

  const kinds = entries.map((entry) => entry.record.kind);

  expect(kinds.filter((kind) => kind.startsWith('record.'))).toStrictEqual([]);
  expect(kinds.slice(-2)).toStrictEqual(['erasure.started', 'erasure.finished']);
});

test.each<ErasureFaultPoint>([
  'erasure.begun',
  'erasure.revoked',
  'erasure.sandboxes_destroyed',
  'erasure.keys_removed',
  'erasure.cleaned',
  'erasure.turn_inputs_removed',
])(
  'it finishes at the next start the forget of a record that a crash at %s cut short',
  async (point) => {
    const ctx = await setupTest();
    const sequence = await ctx.writeOwnerMessage('The shed key sits under the blue pot.');

    ctx.effects.crashAt(point);

    await Promise.allSettled([runRecordForget(ctx.context, { thread: 'conversation', sequence })]);
    await ctx.runner.finishOpen();

    const status = await ctx.readStatus(sequence);
    const kinds = await ctx.readErasureKinds();

    expect({ status, kinds }).toStrictEqual({
      status: 'shredded',
      kinds: [
        ['erasure.started', 'record'],
        ['erasure.finished', 'record'],
      ],
    });
  },
);

test('it finishes at the next start a forget that an earlier release began and never ended', async () => {
  const ctx = await setupTest();
  const sequence = await ctx.writeOwnerMessage('The shed key sits under the blue pot.');

  await writeRecords(ctx.context.log, [
    {
      kind: 'record.forget_started',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { recordSequence: sequence },
    },
  ]);

  await ctx.runner.finishOpen();

  const status = await ctx.readStatus(sequence);
  const kinds = await ctx.readErasureKinds();
  const entries = await readRecords(ctx.context.log, { afterSequence: 0 });

  expect({ status, kinds }).toStrictEqual({
    status: 'shredded',
    kinds: [
      ['erasure.started', 'record'],
      ['erasure.finished', 'record'],
    ],
  });

  expect(entries.map((entry) => entry.record.kind)).not.toContain('record.forgotten');
});

test('it forgets the images that a record holds before the record itself', async () => {
  const ctx = await setupTest();
  const png = await encodeTestImage({ width: 4, height: 3 }, 'png');

  const image = await seedImage(ctx.context.log, {
    image: 'k3x9m2p7qa',
    source: 'draw',
    bytes: new Uint8Array(png),
    prompt: 'a harbour at dusk',
  });

  await runRecordForget(ctx.context, { thread: 'conversation', sequence: image.sequence });

  const kinds = await ctx.readErasureKinds();

  expect(kinds.filter(([kind]) => kind === 'erasure.finished').slice(-2)).toStrictEqual([
    ['erasure.finished', 'image'],
    ['erasure.finished', 'record'],
  ]);
});

test('it forgets a photo imported from a record while the forget of the record cleans up', async () => {
  const ctx = await setupTest();
  const sequence = await ctx.writeOwnerMessage('The shed key sits under the blue pot.');
  const png = await encodeTestImage({ width: 4, height: 3 }, 'png');

  let isImported = false;

  ctx.setSessionCleanup(async () => {
    if (!isImported) {
      isImported = true;

      await seedImage(ctx.context.log, {
        image: 'k3x9m2p7qa',
        source: 'photo',
        sourceSequence: sequence,
        bytes: new Uint8Array(png),
      });
    }
  });

  await runRecordForget(ctx.context, { thread: 'conversation', sequence });

  const entry = await readImageEntry(ctx.context.log, 'k3x9m2p7qa');

  expect(isImported).toBe(true);
  expect(entry.kind).toBe('forgotten');
});

test('it forgets a photo imported from a record while the forget of the record removes turn inputs', async () => {
  const ctx = await setupTest();
  const sequence = await ctx.writeOwnerMessage('The shed key sits under the blue pot.');
  const png = await encodeTestImage({ width: 4, height: 3 }, 'png');

  let isImported = false;

  ctx.setTurnInputRemoval(async () => {
    if (!isImported) {
      isImported = true;

      await seedImage(ctx.context.log, {
        image: 'k3x9m2p7qa',
        source: 'photo',
        sourceSequence: sequence,
        bytes: new Uint8Array(png),
      });
    }
  });

  await runRecordForget(ctx.context, { thread: 'conversation', sequence });

  const entry = await readImageEntry(ctx.context.log, 'k3x9m2p7qa');

  expect(isImported).toBe(true);
  expect(entry.kind).toBe('forgotten');
});

test("it cleans the starter's sessions for an unanswered start call, before the brief's own", async () => {
  const ctx = await setupTest();

  const cleanupSessions = mock<CleanupRecordSessions>(() => Promise.resolve());

  ctx.setSessionCleanup(cleanupSessions);

  const started = await seedUnansweredStartCall(ctx.context, {
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  await runRecordForget(ctx.context, { thread: started.taskID, sequence: started.briefSequence });

  expect(cleanupSessions.mock.calls).toStrictEqual([
    [{ recordSequence: started.callSequence }],
    [{ recordSequence: started.briefSequence }],
  ]);

  const callStatus = await ctx.readStatus(started.callSequence);

  expect(callStatus).toBe('shredded');
});

test('it leaves the unanswered start call of a task with another name readable when it forgets a brief', async () => {
  const ctx = await setupTest();

  const started = await seedTaskStartCall(ctx.context, {
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  const [other] = await writeRecords(ctx.context.log, [
    {
      kind: 'tool_called',
      definitions: ctx.context.definitions(),
      thread: 'conversation',
      payload: { callID: 'call-3', runID: 'conversation', toolUseID: null, tool: 'task.start' },
      erasable: { input: { name: 'Moon phases', brief: 'List the moon phases for May.' } },
    },
  ]);

  invariant(other);

  await runRecordForget(ctx.context, { thread: started.taskID, sequence: started.briefSequence });

  const otherStatus = await ctx.readStatus(other.sequence);

  expect(otherStatus).toBe('readable');
});
