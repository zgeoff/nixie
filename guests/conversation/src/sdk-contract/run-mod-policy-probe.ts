import { cp } from 'node:fs/promises';
import { join } from 'node:path';
import type { ModPolicyScenario } from './build-mod-policy-plan';
import { buildModPolicyPlan } from './build-mod-policy-plan';
import { buildProbeOptions } from './build-probe-options';
import type { ContractRun } from './run-contract-query';
import { runContractQuery } from './run-contract-query';
import type { ProbeTarget } from './types';

// The CLI writes type files into each mod it loads, so the probe loads a copy and never the
// committed mods.
export async function runModPolicyProbe(
  target: ProbeTarget,
  scenario: ModPolicyScenario,
): Promise<ContractRun> {
  const plan = buildModPolicyPlan(scenario);
  const mods = join(target.directory, 'mods');

  await cp(join(import.meta.dir, 'mods'), mods, { recursive: true });

  return runContractQuery({
    prompt: plan.prompt,
    options: {
      ...buildProbeOptions(target),
      tools: ['Bash'],
      allowedTools: ['Bash'],
      permissionMode: 'default',
      permissionPrompts: 'none',
      maxTurns: 10,
      plugins: [{ type: 'local', path: join(mods, plan.mod) }],
    },
  });
}
