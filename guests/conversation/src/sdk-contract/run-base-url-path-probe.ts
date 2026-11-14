import { buildProbeOptions } from './build-probe-options';
import type { ContractRun } from './run-contract-query';
import { runContractQuery } from './run-contract-query';
import type { ProbeTarget } from './types';

// One query whose base URL holds a path beyond the host. A caller reads the model host's request
// log to see whether the CLI kept that path on each request.
export function runBaseURLPathProbe(target: ProbeTarget, baseURL: string): Promise<ContractRun> {
  const options = buildProbeOptions(target);

  return runContractQuery({
    prompt: 'Say hello.',
    options: {
      ...options,
      systemPrompt: 'You are a terse assistant in a test. Follow the instructions exactly.',
      env: { ...options.env, ANTHROPIC_BASE_URL: baseURL },
    },
  });
}
