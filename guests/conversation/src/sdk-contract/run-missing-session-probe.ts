import { buildProbeOptions } from './build-probe-options';
import type { ContractRun } from './run-contract-query';
import { runContractQuery } from './run-contract-query';
import type { ProbeTarget } from './types';

export function runMissingSessionProbe(target: ProbeTarget): Promise<ContractRun> {
  return runContractQuery({
    prompt: 'What is the code word? Answer with the word only.',
    options: {
      ...buildProbeOptions(target),
      systemPrompt: 'You are a terse assistant in a test. Follow the instructions exactly.',
      resume: crypto.randomUUID(),
      forkSession: true,
    },
  });
}
