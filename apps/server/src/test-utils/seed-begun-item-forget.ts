import { systemClock } from '@heynixie/clock';
import { makeErasureRunner } from '@heynixie/log';
import { buildTestErasureEffects } from '@heynixie/log/test-utils';
import { defaultGateLimits, defaultOwnerPronouns, startMemoryStore } from '@heynixie/memory';
import { startDataLog } from './start-data-log';
import type { BootFiles } from './write-boot-files';

export interface BegunItemForgetSeed {
  readonly itemID: string;
}

// Leaves the data where a memory item forget stops after its first transaction: erasure.started is
// written, no key has gone, and nothing else ran. No nixie may hold the data's writer lock.
export async function seedBegunItemForget(
  nixie: Pick<BootFiles, 'dataDir' | 'deploymentKey'>,
): Promise<BegunItemForgetSeed> {
  const testLog = await startDataLog({
    dataDir: nixie.dataDir,
    deploymentKey: nixie.deploymentKey,
    clock: systemClock,
  });

  try {
    const fake = buildTestErasureEffects();

    const runner = makeErasureRunner({
      log: testLog.context.log,
      definitions: testLog.context.definitions,
      effects: fake.effects,
    });

    const memory = await startMemoryStore({
      log: testLog.context.log,
      definitions: testLog.context.definitions,
      erasure: runner,
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

    try {
      const item = await memory.remember({
        text: 'Keeps bees on the allotment',
        provenance: {
          origin: 'owner',
          source: 'owner',
          taskID: null,
          proposalID: null,
          checks: null,
        },
      });

      fake.crashAt('erasure.sandboxes_destroyed');

      await memory
        .forget({
          target: item,
          provenance: {
            origin: 'owner',
            source: 'owner',
            taskID: null,
            proposalID: null,
            checks: null,
          },
        })
        .catch(() => {});

      return { itemID: item.itemID };
    } finally {
      await memory.stop();
    }
  } finally {
    await testLog.writer.stop();
  }
}
