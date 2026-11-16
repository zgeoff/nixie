import { writeStepCommit } from '../step/write-step-commit';
import type { TasksContext } from '../types';
import type { DefinitionRunSeed } from './seed-open-definition-run';
import { seedOpenDefinitionRun } from './seed-open-definition-run';

// Opens the task run as seedOpenDefinitionRun does, then ends it through a step commit that reports.
export async function seedEndedDefinitionRun(
  context: TasksContext,
  seed: DefinitionRunSeed,
): Promise<void> {
  const claim = await seedOpenDefinitionRun(context, seed);

  await writeStepCommit(context, claim, {
    next: 'wait',
    records: [],
    acknowledged: [],
    run: { activity: 'worked', report: { summary: 'Done.' } },
  });
}
