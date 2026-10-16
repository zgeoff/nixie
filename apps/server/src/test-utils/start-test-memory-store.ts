import { mock, onTestFinished } from 'bun:test';
import type { CleanupSessions, StartedMemoryStore } from '@heynixie/memory';
import {
  defaultGateLimits,
  defaultOwnerPronouns,
  findNoAllowRule,
  startMemoryStore,
} from '@heynixie/memory';
import { buildStubEncoder } from '@heynixie/memory/test-utils';
import type { TasksContext } from '@heynixie/tasks';

// Starts a memory store on a test server's context, whose forget runs the session cleanup given,
// and stops it when the test finishes. No checker is wired, so a gated write holds as a proposal;
// with encoder topics, the stub encoder searches by meaning too.
export async function startTestMemoryStore(
  context: TasksContext,
  cleanupSessions: CleanupSessions,
  encoderTopics?: readonly (readonly string[])[],
): Promise<StartedMemoryStore> {
  const store = await startMemoryStore({
    log: context.log,
    definitions: context.definitions,
    cleanupSessions,
    ...(encoderTopics === undefined
      ? {}
      : { semanticSearch: { encoder: buildStubEncoder(encoderTopics), onError: mock() } }),
    gate: {
      check: () =>
        Promise.resolve({
          verdict: 'unsure',
          reason: 'no checker is wired',
          model: 'no-checker',
          failure: 'error',
        }),
      clock: context.clock,
      findAllowRule: findNoAllowRule,
      limits: defaultGateLimits,
      ownerName: null,
      ownerPronouns: defaultOwnerPronouns,
    },
  });

  onTestFinished(() => store.stop());

  return store;
}
