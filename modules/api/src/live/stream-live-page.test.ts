import { expect, test } from 'bun:test';
import { publishChanged, readRecords, writeRecords } from '@heynixie/log';
import { buildExpiryErasable, expiryErasableDescriptor, runExpiry } from '@heynixie/memory';
import { buildAllowingDecisionPoint } from '@heynixie/policy/test-utils';
import { buildToolRegistry, runToolCall } from '@heynixie/tools';
import { buildMockToolDefinition } from '@heynixie/tools/test-utils';
import invariant from 'tiny-invariant';
import { verifySessionToken } from '../session/verify-session-token';
import { createDeviceSession } from '../test-utils/create-device-session';
import { startTestAPI } from '../test-utils/start-test-api';
import { readHeadSequence } from '../utils/read-head-sequence';
import { streamLivePage } from './stream-live-page';

async function setupTest() {
  const api = await startTestAPI();
  const laptop = await createDeviceSession(api.context, 'laptop');
  const caller = await verifySessionToken(api.context, laptop.token);

  invariant(caller !== null, 'a fresh session verifies');

  return {
    ...api,
    laptop,
    follow: (head: number, thread: string | undefined) =>
      streamLivePage(api.context, caller, {
        head,
        afterSequence: 0,
        lastEventID: undefined,
        thread,
        clipPayloads: undefined,
        signal: undefined,
        buildUnauthorized: () => new Error('the session is revoked'),
      }),
  };
}

test('it sends a topic between the records of a replay that fills its batches', async () => {
  const ctx = await setupTest();

  await writeRecords(
    ctx.context.log,
    Array.from({ length: 250 }, (_unused, index) => ({
      kind: 'tool_called' as const,
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: {
        callID: `call-${index}`,
        runID: 'conversation',
        toolUseID: null,
        tool: 'web.fetch',
        model: 'test-model',
        profile: 'test',
      },
    })),
  );

  const head = await readHeadSequence(ctx.context);

  const events = ctx.follow(head, 'conversation');

  await events.next();

  publishChanged(ctx.writer, ['nixie']);

  const seen: string[] = [];

  for await (const event of events) {
    seen.push(event.kind);

    if (event.kind === 'changed') {
      break;
    }
  }

  expect(seen.filter((kind) => kind === 'record').length).toBeLessThan(100);
});

test('it tells a thread on screen which of its records an expiry removed', async () => {
  const ctx = await setupTest();

  const dayMs = 86_400_000;

  const lookup = buildMockToolDefinition({
    name: 'notes.lookup',
    run: () => Promise.resolve({ status: 'ok', result: { text: 'The locker code is 2291.' } }),
  });

  await runToolCall(
    { tool: 'notes.lookup', input: { query: 'locker' }, toolUseID: null },
    {
      runID: 'run-1',
      thread: 'conversation',
      logThread: 'conversation',
      tools: ['notes.lookup'],
      model: { model: 'test-model', profile: 'standard' },
    },
    {
      registry: buildToolRegistry([lookup]),
      decide: buildAllowingDecisionPoint(),
      log: ctx.context.log,
      definitions: () => ({ snapshotHash: 'sha256:test' }),
      queue: {
        enqueue: () => Promise.reject(new Error('the lookup runs direct')),
        readOpenRepeat: () => Promise.resolve(null),
        readOpenAsk: () => Promise.resolve(null),
        waitForOutcome: () => Promise.resolve(null),
      },
      queuedWaitMs: 1000,
    },
  );

  const expiry = ctx.runner.register({
    ...expiryErasableDescriptor,
    ...buildExpiryErasable({ log: ctx.context.log }),
  });

  await runExpiry(expiry, {
    nowMs: Date.now() + 400 * dayMs,
    expireAfterMs: 365 * dayMs,
    batchSize: 500,
  });

  const head = await readHeadSequence(ctx.context);

  const [result] = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['tool_result'],
    limit: 1,
  });

  invariant(result, 'the call wrote a result');

  const events = ctx.follow(head, 'conversation');
  const notices: unknown[] = [];

  for await (const event of events) {
    if (event.kind === 'record' && event.record.expiry !== undefined) {
      notices.push(event.record.expiry);
      break;
    }
  }

  expect(notices).toStrictEqual([{ sequences: [result.record.sequence] }]);
});
