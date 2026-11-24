import { systemClock } from '@heynixie/clock';
import { makeErasureRunner } from '@heynixie/log';
import { buildTestErasureEffects } from '@heynixie/log/test-utils';
import { defaultGateLimits, defaultOwnerPronouns, startMemoryStore } from '@heynixie/memory';
import { buildNotebookMemory, defaultNotebookSettings, startNotebook } from '@heynixie/notebook';
import { startDataLog } from './start-data-log';
import type { BootFiles } from './write-boot-files';

export interface BegunNoteForgetSeed {
  readonly noteID: string;
  readonly shortID: string;
}

// Leaves the data where a note forget stops after its first transaction: erasure.started is
// written, no key has gone, and nothing else ran. No nixie may hold the data's writer lock.
export async function seedBegunNoteForget(
  nixie: Pick<BootFiles, 'dataDir' | 'deploymentKey'>,
): Promise<BegunNoteForgetSeed> {
  const testLog = await startDataLog({
    dataDir: nixie.dataDir,
    deploymentKey: nixie.deploymentKey,
    clock: systemClock,
  });

  try {
    const runner = makeErasureRunner({
      log: testLog.context.log,
      definitions: testLog.context.definitions,
      effects: buildTestErasureEffects().effects,
    });

    const memory = await startMemoryStore({
      log: testLog.context.log,
      definitions: testLog.context.definitions,
      erasure: runner,
      cleanupSessions: () => Promise.resolve(),
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
      const notebook = await startNotebook({
        log: testLog.context.log,
        definitions: testLog.context.definitions,
        clock: systemClock,
        settings: defaultNotebookSettings,
        memory: buildNotebookMemory(() => memory),
        erasure: runner,
        readRunningStep: () => Promise.resolve(null),
      });

      try {
        const written = await notebook.write(
          { writer: 'conversation', model: 'model-a' },
          { title: 'Boiler notes', body: 'The boiler trips after a cold night.' },
        );

        if (written.status !== 'written') {
          throw new Error('the seed note was not written');
        }

        const begun = await notebook.beginForget({ note: written.shortID });

        if (begun.status !== 'begun') {
          throw new Error('the seed forget did not begin');
        }

        return { noteID: begun.noteID, shortID: written.shortID };
      } finally {
        await notebook.stop();
      }
    } finally {
      await memory.stop();
    }
  } finally {
    await testLog.writer.stop();
  }
}
