import { mock, onTestFinished } from 'bun:test';
import type { TasksContext } from '@heynixie/tasks';
import { defaultGateLimits } from '../default-gate-limits';
import { defaultOwnerPronouns } from '../default-owner-pronouns';
import { findNoAllowRule } from '../find-no-allow-rule';
import type { StartedMemoryStore } from '../start-memory-store';
import { startMemoryStore } from '../start-memory-store';
import type { CleanupSessions } from '../types';
import { buildStubEncoder } from './build-stub-encoder';

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
      : {
          semanticSearch: {
            encoder: buildStubEncoder(encoderTopics),
            onError: mock<(error: unknown) => void>(),
          },
        }),
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
