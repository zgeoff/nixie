import { expect, onTestFinished, test } from 'bun:test';
import { seedJoinedSession, startTestCodingSource } from '@heynixie/coding/test-utils';
import { createConversationTask } from '@heynixie/tasks';
import { waitFor } from '@zgeoff/testing';
import invariant from 'tiny-invariant';
import { buildTestClient } from '../test-utils/build-test-client';
import { createDeviceSession } from '../test-utils/create-device-session';
import { startTestAPI } from '../test-utils/start-test-api';

async function setupTest() {
  const api = await startTestAPI(undefined, { isCodingOn: true });

  invariant(api.coding, 'the test turns coding on');

  const coding = api.coding;

  await createConversationTask(api.context);

  const laptop = await createDeviceSession(api.context, 'laptop');

  const client = buildTestClient(api.url, laptop.token);

  return {
    ...api,
    client,
    adapter: coding.adapter,
    joinSession: () =>
      seedJoinedSession(coding, api.context, {
        id: 'cloud.3f9a1c2e.00000001',
        name: 'login fix',
        state: 'idle',
      }),
    startSource: () => startTestCodingSource(coding, api.context),
    buildState: (eventKey: string, state: 'running' | 'waiting' | 'idle', at: string) => ({
      session: 'cloud.3f9a1c2e.00000001',
      eventKey,
      at,
      kind: 'state' as const,
      state,
      question: null,
    }),
    readSessions: async () => {
      const listed = await client.tasks.list({});

      return listed.tasks.flatMap((task) =>
        task.session === undefined ? [] : [{ name: task.name, session: task.session }],
      );
    },
  };
}

test('#tasks.list lists the session of a task that joined one, with its origin, state and no event yet', async () => {
  const ctx = await setupTest();

  await ctx.joinSession();

  const sessions = await ctx.readSessions();

  expect(sessions).toStrictEqual([
    { name: 'login fix', session: { origin: 'joined', state: 'idle', lastEventAt: null } },
  ]);
});

test('#tasks.list lists no session for the conversation, which supervises none', async () => {
  const ctx = await setupTest();
  const listed = await ctx.client.tasks.list({});

  expect(listed.tasks.map((task) => task.session)).toStrictEqual([undefined]);
});

test('#tasks.list moves the state and the last event time of the session as its events land', async () => {
  const ctx = await setupTest();

  await ctx.joinSession();

  const stop = await ctx.startSource();

  onTestFinished(stop);

  ctx.adapter.emit([ctx.buildState('cloud|1', 'running', '2027-03-09T10:00:00.000Z')]);

  const running = await waitFor(async () => {
    const sessions = await ctx.readSessions();

    expect(sessions.map((entry) => entry.session.state)).toStrictEqual(['running']);

    return sessions;
  });

  ctx.adapter.emit([ctx.buildState('cloud|2', 'waiting', '2027-03-09T10:05:00.000Z')]);

  const waiting = await waitFor(async () => {
    const sessions = await ctx.readSessions();

    expect(sessions.map((entry) => entry.session.state)).toStrictEqual(['waiting']);

    return sessions;
  });

  expect([running[0]?.session.lastEventAt, waiting[0]?.session.lastEventAt]).toStrictEqual([
    new Date('2027-03-09T10:00:00.000Z'),
    new Date('2027-03-09T10:05:00.000Z'),
  ]);
});

test('#tasks.list shows no task for a session that nixie never started or joined', async () => {
  const ctx = await setupTest();

  await ctx.joinSession();

  const stop = await ctx.startSource();

  onTestFinished(stop);

  ctx.adapter.addSession({ id: 'cloud.3f9a1c2e.00000002', name: 'your own session' });

  ctx.adapter.emit([
    {
      ...ctx.buildState('cloud|1', 'waiting', '2027-03-09T10:00:00.000Z'),
      session: 'cloud.3f9a1c2e.00000002',
    },
    ctx.buildState('cloud|2', 'running', '2027-03-09T10:01:00.000Z'),
  ]);

  await waitFor(async () => {
    const sessions = await ctx.readSessions();

    expect(sessions.map((entry) => entry.session.state)).toStrictEqual(['running']);
  });

  const listed = await ctx.client.tasks.list({});

  expect(listed.tasks.map((task) => task.name)).toHaveLength(2);
});

test('#live.follow names the tasks topic when the state of a session changes', async () => {
  const ctx = await setupTest();

  await ctx.joinSession();

  const stop = await ctx.startSource();

  onTestFinished(stop);

  ctx.adapter.emit([ctx.buildState('cloud|1', 'running', '2027-03-09T10:00:00.000Z')]);

  await waitFor(async () => {
    const sessions = await ctx.readSessions();

    expect(sessions.map((entry) => entry.session.state)).toStrictEqual(['running']);
  });

  const stream = await ctx.client.live.follow({});

  await stream.next();

  ctx.adapter.emit([ctx.buildState('cloud|2', 'idle', '2027-03-09T10:05:00.000Z')]);

  const changed = await stream.next();

  await stream.return(undefined);

  expect(changed.value).toStrictEqual({ kind: 'changed', topics: ['tasks', 'triggers'] });
});
