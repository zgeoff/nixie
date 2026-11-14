import { expect, test } from 'bun:test';
import { readTestLeases } from './read-test-leases';
import { seedConversationStep } from './seed-conversation-step';
import { seedGoneHolderLease } from './seed-gone-holder-lease';
import { startTestTasks } from './start-test-tasks';

test('it leaves the lease of a task held by a holder that is gone', async () => {
  const ctx = await startTestTasks();

  await seedConversationStep(ctx.context);
  await seedGoneHolderLease(ctx.context, 'conversation');

  const leases = await readTestLeases(ctx.writer);

  expect(leases).toMatchObject([{ workID: 'conversation', holder: 'nixie-gone' }]);
});
