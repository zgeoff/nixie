import invariant from 'tiny-invariant';
import { claimTask } from '../claim-task';
import { createConversationTask } from '../create-conversation-task';
import type { TaskClaim, TasksContext } from '../types';
import { writeInboxRecords } from '../write-inbox-records';

// Creates the conversation, sends it your message with the text, and claims its next step for
// runner-a under a 60 s lease on the context's clock. On a store with no other ready task, the
// claim takes the conversation.
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

  // the message just made the conversation ready, so the claim finds it
  invariant(claim);

  return claim;
}
