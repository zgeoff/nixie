import { seedDefinitionTask, seedOpenDefinitionRun } from '@heynixie/tasks/test-utils';
import type { TestTasks } from '@heynixie/tasks/test-utils';
import invariant from 'tiny-invariant';
import { createAllowedAction } from '../action/create-allowed-action';
import { buildMockLiftedCall } from './build-mock-lifted-call';
import { createTestStep } from './create-test-step';
import { seedDeclinedProposal } from './seed-declined-proposal';

export interface DeclinedBuy {
  // the open task run's step, which asked
  readonly step: Awaited<ReturnType<typeof seedOpenDefinitionRun>>;
  readonly taskID: string;
  readonly shortID: string;

  // what opens another run of the same task
  readonly run: Parameters<typeof seedOpenDefinitionRun>[1];
}

// A definition task whose open run asked to buy over its budget and whose user declined: another
// task spent 6 of the 10 dollars, and the run asked to spend 6 more.
export async function seedDeclinedBuy(tasks: TestTasks): Promise<DeclinedBuy> {
  const spender = await createTestStep(tasks.context);

  await createAllowedAction(tasks.context, buildMockLiftedCall(spender, 6_000_000));

  const taskID = await seedDefinitionTask(tasks, {
    definitionID: 'weekly-shop',
    definitionHash: 'hash-1',
  });

  const run = { taskID, definitionID: 'weekly-shop', definitionHash: 'hash-1' };

  const step = await seedOpenDefinitionRun(tasks.context, run);
  const asked = await createAllowedAction(tasks.context, buildMockLiftedCall(step, 6_000_000));

  invariant('shortID' in asked, 'a purchase over the budget asks');

  await seedDeclinedProposal(tasks.context, asked.shortID);

  return { step, taskID, shortID: asked.shortID, run };
}
