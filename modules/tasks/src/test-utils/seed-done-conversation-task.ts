import type { TasksContext } from '../types';
import { writeStepCommit } from '../write-step-commit';
import { seedConversationStep } from './seed-conversation-step';

export async function seedDoneConversationTask(context: TasksContext): Promise<void> {
  const step = await seedConversationStep(context);

  await writeStepCommit(context, step.claim, {
    next: 'done',
    records: [],
    acknowledged: [step.messageSequence],
  });
}
