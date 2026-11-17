import { mock, onTestFinished } from 'bun:test';
import type { CleanupSessions, StartedMemoryStore } from '@heynixie/memory';
import { defaultGateLimits, defaultOwnerPronouns, startMemoryStore } from '@heynixie/memory';
import type { APIContext, CleanupRecordSessions } from '../types';

export interface TestMemoryForgets {
  readonly memory: StartedMemoryStore;

  // the API's context with the session cleanup of a running nixie: it finishes the evidence
  // purges of the forgotten record
  readonly forgetContext: APIContext;
}

// Starts the memory store over the API's log, and answers the context that runs a forget's cleanup
// against it.
export async function startTestMemoryForgets(
  context: APIContext & { readonly clock: Parameters<typeof startMemoryStore>[0]['gate']['clock'] },
): Promise<TestMemoryForgets> {
  const memory = await startMemoryStore({
    log: context.log,
    definitions: () => ({ snapshotHash: 'sha256:test' }),
    cleanupSessions: mock<CleanupSessions>(() => Promise.resolve()),
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

  onTestFinished(() => memory.stop());

  const cleanupSessions: CleanupRecordSessions = (cause) =>
    memory.finishEvidencePurges({ recordSequence: cause.recordSequence });

  return { memory, forgetContext: { ...context, readSessionCleanup: () => cleanupSessions } };
}
