import { expect, test } from 'bun:test';
import { seedBudgetInForce } from '@heynixie/budgets/test-utils';
import { readRecords } from '@heynixie/log';
import { conversationTaskID } from '@heynixie/tasks';
import { startTestCalls } from '../test-utils';
import { readCall } from '../utils/read-call';
import { startCall } from './start-call';

async function setupTest() {
  const ctx = await startTestCalls();

  return {
    ...ctx,
    readCallRecords: async () => {
      const found = await readRecords(ctx.log, { afterSequence: 0 });

      return found
        .map((entry) => entry.record)
        .filter((record) => record.kind.startsWith('call.'))
        .map((record) => ({ kind: record.kind, thread: record.thread, payload: record.payload }));
    },
  };
}

test('it opens a call that the calling session carries', async () => {
  const ctx = await setupTest();
  const result = await startCall(ctx.context, { carryingSession: 'identity-1' });

  expect(result).toStrictEqual({
    status: 'started',
    callID: expect.stringMatching(/^[a-z0-9]{10}$/u),
  });

  const records = await ctx.readCallRecords();

  expect(records).toStrictEqual([
    {
      kind: 'call.started',
      thread: conversationTaskID,
      payload: {
        callID: expect.any(String),
        taskID: expect.any(String),
        startedBy: 'you',
        carryingSession: 'identity-1',
      },
    },
    {
      kind: 'call.answered',
      thread: conversationTaskID,
      payload: { callID: expect.any(String), carryingSession: 'identity-1' },
    },
  ]);
});

test('it folds the started call into a connecting row that names its task', async () => {
  const ctx = await setupTest();
  const result = await startCall(ctx.context, { carryingSession: 'identity-1' });

  expect(result.status).toBe('started');

  const callID = result.status === 'started' ? result.callID : '';

  const call = await readCall(ctx.writer.db, callID);

  expect(call).toStrictEqual({
    callID,
    taskID: ctx.createdTasks[0]?.taskID ?? '',
    state: 'connecting',
    startedBy: 'you',
    carryingSession: 'identity-1',
    startedAtMs: ctx.clock.now(),
    connectedAtMs: null,
    endedAtMs: null,
    endedBy: null,
    minutes: 0,
  });
});

test('it gives the call task the sequence of the log head to seed from', async () => {
  const ctx = await setupTest();

  await startCall(ctx.context, { carryingSession: 'identity-1' });

  expect(ctx.createdTasks).toStrictEqual([
    { callID: expect.any(String), seedThrough: 0, taskID: expect.any(String) },
  ]);
});

test('it answers VOICE_OFF when the config has no voice section, and writes nothing', async () => {
  const ctx = await startTestCalls({ voice: 'off' });
  const result = await startCall(ctx.context, { carryingSession: 'identity-1' });

  expect(result).toStrictEqual({ status: 'refused', error: 'VOICE_OFF' });

  const written = await readRecords(ctx.log, { afterSequence: 0 });

  expect(written).toStrictEqual([]);
});

test('it answers SPEECH_UNAVAILABLE when voice is set and no speech layer is wired', async () => {
  const ctx = await startTestCalls({ speech: 'absent' });
  const result = await startCall(ctx.context, { carryingSession: 'identity-1' });

  expect(result).toStrictEqual({ status: 'refused', error: 'SPEECH_UNAVAILABLE' });
});

test('it refuses a call while the voice definitions hold no price', async () => {
  const ctx = await startTestCalls({ pricePerMinuteMicros: null });
  const result = await startCall(ctx.context, { carryingSession: 'identity-1' });

  expect(result).toStrictEqual({ status: 'refused', error: 'VOICE_PRICE_MISSING' });
});

test('it refuses a second call while one runs', async () => {
  const ctx = await setupTest();

  await startCall(ctx.context, { carryingSession: 'identity-1' });

  const second = await startCall(ctx.context, { carryingSession: 'identity-2' });

  expect(second).toStrictEqual({ status: 'refused', error: 'CALL_RUNNING' });
  expect(ctx.createdTasks).toHaveLength(1);
});

test('it refuses a call when call-day has no room for a minute', async () => {
  const ctx = await setupTest();

  await seedBudgetInForce(ctx.writer, {
    id: 'call-day',
    counts: 'tool:call',
    limitMicros: 40_000,
    period: 'day',
  });

  const result = await startCall(ctx.context, { carryingSession: 'identity-1' });

  expect(result).toStrictEqual({ status: 'refused', error: 'CALL_BUDGET_REACHED' });
  expect(ctx.createdTasks).toHaveLength(0);
});
