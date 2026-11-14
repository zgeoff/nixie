import invariant from 'tiny-invariant';
import { createConversationTask } from '../conversation/create-conversation-task';
import { claimTask } from '../task/projection/claim-task';
import { writeInboxRecords } from '../task/projection/write-inbox-records';
import type { StartedClaim, TasksContext } from '../types';
import { conversationTaskID } from '../utils/conversation-task-id';

export interface ConversationStep {
  readonly claim: StartedClaim;
  readonly messageSequence: number;
}

// A start needs a running step of its starter, so a test that starts a task seeds this step first.
export async function seedConversationStep(context: TasksContext): Promise<ConversationStep> {
  await createConversationTask(context);

  const [message] = await writeInboxRecords(context, [
    {
      kind: 'owner_message',
      definitions: context.definitions(),
      thread: conversationTaskID,
      erasable: { text: 'Please look into this for me.' },
    },
  ]);

  const claim = await claimTask(context, {
    holder: 'seed-runner',
    leaseMs: 60_000,
    taskID: conversationTaskID,
  });

  invariant(claim && message, 'the conversation is ready for its message');

  return { claim, messageSequence: message.sequence };
}
