import invariant from 'tiny-invariant';
import { buildProbeOptions } from './build-probe-options';
import type { ContractRun } from './run-contract-query';
import { runContractQuery } from './run-contract-query';
import type { ProbeTarget } from './types';

export type PinnedCoreSnapshot = 'off' | 'default';

export async function runPinnedCoreProbe(
  target: ProbeTarget,
  snapshot: PinnedCoreSnapshot,
): Promise<ContractRun> {
  const options = buildProbeOptions(target);

  const first = await runContractQuery({
    prompt: "What is the owner's code word? Answer with the word only.",
    options: {
      ...options,
      systemPrompt: buildSystemPrompt("Pinned memory: the owner's code word is APPLE.", snapshot),
    },
  });

  const sessionID = first.messages.at(-1)?.session_id;

  invariant(
    sessionID !== undefined,
    'the first run of the pinned-core probe ended with no session',
  );

  return runContractQuery({
    prompt: "What is the owner's code word now? Answer with the word only.",
    options: {
      ...options,
      resume: sessionID,
      systemPrompt: buildSystemPrompt("Pinned memory: the owner's code word is BANANA.", snapshot),
    },
  });
}

function buildSystemPrompt(prompt: string, snapshot: PinnedCoreSnapshot) {
  return snapshot === 'off' ? { type: 'custom' as const, prompt, snapshot: false } : prompt;
}
