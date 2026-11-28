import { expect, test } from 'bun:test';
import { startTestCoding } from '../test-utils/start-test-coding';
import { readSessionShortIDs } from './read-session-short-ids';

test('it gives the short ID of the session that a coding task binds, and none for another task', async () => {
  const ctx = await startTestCoding();
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

  const ids = await readSessionShortIDs(ctx.log.writer.db, [taskID, 'conversation']);

  expect(ids).toStrictEqual(new Map([[taskID, session]]));
});
