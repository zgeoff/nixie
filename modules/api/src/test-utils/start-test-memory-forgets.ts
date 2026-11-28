import { onTestFinished } from 'bun:test';
import type { ErasureRunnerControl } from '@heynixie/log';
import type { StartedMemoryStore } from '@heynixie/memory';
import { defaultGateLimits, defaultOwnerPronouns, startMemoryStore } from '@heynixie/memory';
import type { APIContext } from '../types';
import { buildTestErasureRunner } from './build-test-erasure-runner';
import { registerTestRecordForgets } from './register-test-record-forgets';

export interface TestMemoryForgets {
  readonly memory: StartedMemoryStore;

  // the runner the items register on, whose catch-up finishes a forget that an earlier release left
  readonly runner: ErasureRunnerControl;

  // the API's context with the handles of a running nixie, whose runner finishes the evidence
  // purges of the forgotten record
  readonly forgetContext: APIContext;
}

// Starts the memory store over the API's log, and answers the context that runs a forget's cleanup
// against it.
export async function startTestMemoryForgets(
  context: APIContext & { readonly clock: Parameters<typeof startMemoryStore>[0]['gate']['clock'] },
): Promise<TestMemoryForgets> {
  const purging: { memory: StartedMemoryStore | null } = { memory: null };

  const runner = buildTestErasureRunner(context.log, undefined, async (recordSequence) => {
    await purging.memory?.finishEvidencePurges({ recordSequence });
  });

  const memory = await startMemoryStore({
    log: context.log,
    definitions: () => ({ snapshotHash: 'sha256:test' }),
    erasure: runner,
    gate: {
      check: () =>
        Promise.resolve({
          verdict: 'unsure',
          reason: 'no checker is wired',
          model: 'no-checker',
          failure: 'error',
        }),
      clock: context.clock,
      defaultZone: 'UTC',
      limits: defaultGateLimits,
      ownerName: null,
      ownerPronouns: defaultOwnerPronouns,
      getPromptsInForce: () => ({ snapshotHash: 'sha256:test', prompts: {} }),
    },
  });

  purging.memory = memory;

  onTestFinished(() => memory.stop());

  const forgets = registerTestRecordForgets(context, runner);

  return {
    memory,
    runner,
    forgetContext: {
      ...context,
      readForgets: () => forgets,
    },
  };
}
