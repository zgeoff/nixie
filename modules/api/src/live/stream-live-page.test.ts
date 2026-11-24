import { expect, test } from 'bun:test';
import { publishChanged, writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { verifySessionToken } from '../session/verify-session-token';
import { buildTestClient } from '../test-utils/build-test-client';
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
    client: buildTestClient(api.url, laptop.token),
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

test('it ends with the refusal when the session was revoked after the head it starts from', async () => {
  const ctx = await setupTest();

  // the revoke commits after the head read and before the stream starts, as one that follows a
  // session check does
  const head = await readHeadSequence(ctx.context);

  await ctx.client.sessions.revoke({
    clientActionID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    sessionID: ctx.laptop.sessionID,
  });

  const events = ctx.follow(head, undefined);

  const [settled] = await Promise.allSettled([Array.fromAsync(events)]);

  expect(settled).toMatchObject({
    status: 'rejected',
    reason: { message: 'the session is revoked' },
  });
});

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
