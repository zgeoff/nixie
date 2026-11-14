import { writeStepCommit } from '../step/write-step-commit';
import type { TasksContext } from '../types';
import { seedConversationStep } from './seed-conversation-step';

export async function seedDoneConversationTask(context: TasksContext): Promise<void> {
  const step = await seedConversationStep(context);

  await writeStepCommit(context, step.claim, {
    next: 'done',
    records: [],
    acknowledged: [step.messageSequence],
  });
}
