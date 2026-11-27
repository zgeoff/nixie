import { systemClock } from '@heynixie/clock';
import type { StartedMemoryStore } from '@heynixie/memory';
import { defaultGateLimits, defaultOwnerPronouns, startMemoryStore } from '@heynixie/memory';
import type { DataLog } from './start-data-log';

// A memory store over a stopped nixie's data, whose checker asserts nothing, so a seed writes through
// the store's own functions.
export function startSeedMemory(context: DataLog['context']): Promise<StartedMemoryStore> {
  return startMemoryStore({
    log: context.log,
    definitions: context.definitions,
    gate: {
      check: () =>
        Promise.resolve({
          verdict: 'unsure',
          reason: 'no checker is wired',
          model: 'no-checker',
          failure: 'error',
        }),
      clock: systemClock,
      defaultZone: 'UTC',
      limits: defaultGateLimits,
      ownerName: null,
      ownerPronouns: defaultOwnerPronouns,
      getPromptsInForce: () => ({ snapshotHash: 'sha256:test', prompts: {} }),
    },
  });
}
