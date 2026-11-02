import invariant from 'tiny-invariant';
import { buildOverflowOptions } from './build-overflow-options';
import type { OverflowScenario } from './build-overflow-plan';
import { buildOverflowPlan } from './build-overflow-plan';
import type { ContractRun } from './run-contract-query';
import { runContractQuery } from './run-contract-query';
import type { ProbeTarget } from './types';

export async function runOverflowProbe(
  target: ProbeTarget,
  scenario: OverflowScenario,
): Promise<ContractRun> {
  const plan = buildOverflowPlan(buildOverflowOptions(target), scenario);

  if (plan.seedPrompt === null) {
    return runContractQuery({ prompt: plan.prompt, options: plan.options });
  }

  const seed = await runContractQuery({ prompt: plan.seedPrompt, options: plan.options });

  const seedResult = seed.messages.findLast((message) => message.type === 'result');

  invariant(seedResult, 'the first turn of the overflow probe ended with no result');

  return runContractQuery({
    prompt: plan.prompt,
    options: { ...plan.options, resume: seedResult.session_id },
  });
}
