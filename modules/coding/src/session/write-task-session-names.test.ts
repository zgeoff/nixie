import { expect, test } from 'bun:test';
import { startTestCoding } from '../test-utils/start-test-coding';
import { writeTaskSessionNames } from './write-task-session-names';

function setupTest() {
  return startTestCoding();
}

test('#writeTaskSessionNames names the session that a task just spawned, and keeps its ID on a second call', async () => {
  const ctx = await setupTest();
  const claim = await ctx.claimConversation();

  const taskID = await ctx.startTask(claim, {
    name: 'Fix the flaky login test',
    brief: 'Find why the login test fails.',
    repo: { url: 'https://github.com/example/shop.git', ref: 'main' },
  });

  await ctx.runActions();
  await ctx.runSteps();

  const first = await writeTaskSessionNames(ctx.context, [taskID]);
  const second = await writeTaskSessionNames(ctx.context, [taskID]);

  expect({
    named: first.has(taskID),
    isStable: second.get(taskID) === first.get(taskID),
  }).toStrictEqual({
    named: true,
    isStable: true,
  });
});

test('#writeTaskSessionNames gives the short ID that a listing gave a joined session, and none for a task with no session', async () => {
  const ctx = await setupTest();
  const claim = await ctx.claimConversation();

  ctx.adapter.addSession({
    id: 'cloud.3f9a1c2e.7c1d0e55',
    name: 'billing refactor',
    state: 'idle',
  });

  const listed = await ctx.callTool(claim, 'coding.sessions', {});

  const text = listed.outcome.status === 'ok' ? JSON.stringify(listed.outcome.result) : '';
  const session = /"id":"(?<id>[^"]+)"/u.exec(text)?.groups?.['id'] ?? '';

  const taskID = await ctx.startTask(claim, {
    name: 'Your billing refactor',
    brief: 'Watch for a question.',
    session,
  });

  const ids = await writeTaskSessionNames(ctx.context, [taskID, 'conversation']);

  expect(ids).toStrictEqual(new Map([[taskID, session]]));
});
