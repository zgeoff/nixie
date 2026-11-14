import invariant from 'tiny-invariant';
import { createConversationTask } from '../conversation/create-conversation-task';
import { writeStepError } from '../step/write-step-error';
import { claimTask } from '../task/projection/claim-task';
import { writeInboxRecords } from '../task/projection/write-inbox-records';
import type { TasksContext } from '../types';

export async function seedFailedConversationTurn(context: TasksContext): Promise<void> {
  await createConversationTask(context);

  await writeInboxRecords(context, [
    {
      kind: 'owner_message',
      definitions: context.definitions(),
      thread: 'conversation',
      erasable: { text: 'Is the library open late?' },
    },
  ]);

  const claim = await claimTask(context, {
    holder: 'seed-runner',
    leaseMs: 60_000,
    taskID: 'conversation',
  });

  invariant(claim, 'the conversation is ready for its message');

  await writeStepError(context, claim, {
    maxStepErrors: 3,
    retryDelayMs: 30_000,
    maxRetryDelayMs: 300_000,
    error: new Error('the provider is overloaded'),
  });
}
