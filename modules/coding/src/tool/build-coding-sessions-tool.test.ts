import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { startTestCoding } from '../test-utils/start-test-coding';

function setupTest() {
  return startTestCoding();
}

test('it lists every session that has not ended, each with a short ID and no task', async () => {
  const ctx = await setupTest();
  const claim = await ctx.claimConversation();

  ctx.adapter.addSession({
    id: 'cloud.3f9a1c2e.7c1d0e55',
    name: 'billing refactor',
    state: 'idle',
  });

  ctx.adapter.addSession({
    id: 'laptop.0b4e9d21.5a6f7e80',
    name: 'docs pass',
    state: 'waiting',
    target: { daemon: 'laptop', target: 'local' },
  });

  ctx.adapter.addSession({ id: 'cloud.3f9a1c2e.11aa22bb', name: 'old spike', state: 'ended' });

  const listed = await ctx.callTool(claim, 'coding.sessions', {});

  expect(listed.outcome).toStrictEqual({
    status: 'ok',
    result: {
      sessions: [
        {
          id: expect.any(String),
          name: 'billing refactor',
          state: 'idle',
          target: 'cloud/cloud',
          cwd: '/work/billing refactor',
          boundTo: null,
        },
        {
          id: expect.any(String),
          name: 'docs pass',
          state: 'waiting',
          target: 'laptop/local',
          cwd: '/work/docs pass',
          boundTo: null,
        },
      ],
    },
  });
});

test('it never puts the session ID of the system in the result', async () => {
  const ctx = await setupTest();
  const claim = await ctx.claimConversation();

  ctx.adapter.addSession({
    id: 'cloud.3f9a1c2e.7c1d0e55',
    name: 'billing refactor',
    state: 'idle',
  });

  const listed = await ctx.callTool(claim, 'coding.sessions', {});

  expect(JSON.stringify(listed.outcome)).not.toContain('7c1d0e55');
});

test('it gives a session the same short ID across two listings', async () => {
  const ctx = await setupTest();
  const claim = await ctx.claimConversation();

  ctx.adapter.addSession({
    id: 'cloud.3f9a1c2e.7c1d0e55',
    name: 'billing refactor',
    state: 'idle',
  });

  const first = await ctx.callTool(claim, 'coding.sessions', {});
  const second = await ctx.callTool(claim, 'coding.sessions', {});

  expect(second.outcome).toStrictEqual(first.outcome);
});

test('it names the coding task that joined a session in boundTo', async () => {
  const ctx = await setupTest();
  const claim = await ctx.claimConversation();

  ctx.adapter.addSession({
    id: 'cloud.3f9a1c2e.7c1d0e55',
    name: 'billing refactor',
    state: 'idle',
  });

  const listed = await ctx.callTool(claim, 'coding.sessions', {});

  const shortID = /"id":"(?<id>[^"]+)"/u.exec(JSON.stringify(listed.outcome))?.groups?.['id'];

  invariant(shortID !== undefined);

  const taskID = await ctx.startTask(claim, {
    name: 'Your billing refactor',
    brief: 'Watch for a question.',
    session: shortID,
  });

  await ctx.runActions();
  await ctx.runSteps();

  const relisted = await ctx.callTool(claim, 'coding.sessions', {});

  expect(relisted.outcome).toStrictEqual({
    status: 'ok',
    result: {
      sessions: [
        {
          id: shortID,
          name: 'billing refactor',
          state: 'idle',
          target: 'cloud/cloud',
          cwd: '/work/billing refactor',
          boundTo: taskID,
        },
      ],
    },
  });
});

test('it gives an error outcome with the reason when the system refuses the listing', async () => {
  const ctx = await setupTest();
  const claim = await ctx.claimConversation();

  ctx.adapter.replyNext('list', { status: 'refused', canClear: true, reason: 'host_asleep' });

  const listed = await ctx.callTool(claim, 'coding.sessions', {});

  expect(listed.outcome).toStrictEqual({
    status: 'error',
    message: 'nixie could not list the sessions: host_asleep.',
  });
});

test('it gives an error outcome for an adapter that is not its own', async () => {
  const ctx = await setupTest();
  const claim = await ctx.claimConversation();
  const listed = await ctx.callTool(claim, 'coding.sessions', { adapter: 'other' });

  expect(listed.outcome).toStrictEqual({ status: 'error', message: 'The adapter must be atc.' });
});
