import invariant from 'tiny-invariant';
import { buildStepRunID } from '../build-step-run-id';
import { claimTask } from '../claim-task';
import { createConversationTask } from '../create-conversation-task';
import type { TasksContext } from '../types';
import { writeInboxRecords } from '../write-inbox-records';
import { writeStepCommit } from '../write-step-commit';
import { writeTaskStart } from '../write-task-start';

export interface StartedTaskSeed {
  readonly name: string;
  readonly brief: string;
}

// The conversation starts the task in a step of its own, which then commits as waiting with its
// message read, so only the started task is left to claim.
export async function seedStartedTask(
  context: TasksContext,
  seed: StartedTaskSeed,
): Promise<string> {
  await createConversationTask(context);

  const [message] = await writeInboxRecords(context, [
    {
      kind: 'owner_message',
      definitions: context.definitions(),
      thread: 'conversation',
      erasable: { text: `Please start ${seed.name}.` },
    },
  ]);

  const claim = await claimTask(context, {
    holder: 'seed-runner',
    leaseMs: 60_000,
    tasks: 'unstarted',
  });

  invariant(
    claim?.lease.workID === 'conversation' && message,
    'the conversation is the only ready task that no start started',
  );

  const outcome = await writeTaskStart(context, {
    from: 'conversation',
    name: seed.name,
    brief: seed.brief,
    stepRunID: buildStepRunID(claim),
  });

  invariant(outcome.status === 'started', 'the seeded start is valid');

  await writeStepCommit(context, claim, {
    next: 'wait',
    records: [],
    acknowledged: [message.sequence],
  });

  return outcome.taskID;
}
