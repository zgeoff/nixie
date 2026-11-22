import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { startTestTasks } from '../test-utils/start-test-tasks';
import { readApprovalTime } from './read-approval-time';

async function setupTest() {
  const tasks = await startTestTasks({ recordsAtMs: Date.parse('2027-03-09T03:00:00Z') });

  return { log: tasks.context.log, clock: tasks.clock, context: tasks.context };
}

test('it reads the time of the approval that queued the settled action', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    {
      kind: 'policy.action_answered',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: {
        proposalID: 'b-uuid',
        shortID: 'k3vq8m2xpa',
        answer: 'approved',
        actionID: 'b-uuid',
      },
    },
  ]);

  ctx.clock.advance(60_000);

  const [outcome] = await writeRecords(ctx.log, [
    {
      kind: 'action.outcome',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: {
        actionID: 'b-uuid',
        tool: 'computer.run',
        status: 'done',
        attempt: 1,
        reason: null,
      },
    },
  ]);

  invariant(outcome, 'the outcome was written');

  const approvedAt = await readApprovalTime(ctx.context, outcome);

  expect(approvedAt).toStrictEqual(new Date('2027-03-09T03:00:00Z'));
});

test('it reads no approval time for an action that an allow rule queued', async () => {
  const ctx = await setupTest();

  const [outcome] = await writeRecords(ctx.log, [
    {
      kind: 'action.outcome',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { actionID: 'c-uuid', tool: 'test.send', status: 'done', attempt: 1, reason: null },
    },
  ]);

  invariant(outcome, 'the outcome was written');

  const approvedAt = await readApprovalTime(ctx.context, outcome);

  expect(approvedAt).toBeNull();
});
