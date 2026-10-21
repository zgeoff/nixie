import invariant from 'tiny-invariant';
import { claimTask } from '../claim-task';
import { createConversationTask } from '../create-conversation-task';
import type { TaskClaim, TasksContext } from '../types';
import { writeInboxRecords } from '../write-inbox-records';

export async function createTestConversationClaim(
  context: TasksContext,
  text: string,
): Promise<TaskClaim> {
  await createConversationTask(context);

  await writeInboxRecords(context, [
    {
      kind: 'owner_message',
      definitions: context.definitions(),
      thread: 'conversation',
      erasable: { text },
    },
  ]);

  const claim = await claimTask(context, { holder: 'runner-a', leaseMs: 60_000 });

  invariant(claim);

  return claim;
}
