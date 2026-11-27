import { mock, onTestFinished } from 'bun:test';
import type { ErasureRegistry } from '@heynixie/log';
import type { TasksContext } from '@heynixie/tasks';
import { defaultGateLimits } from '../gate/default-gate-limits';
import type { StartedMemoryStore } from '../memory/start-memory-store';
import { startMemoryStore } from '../memory/start-memory-store';
import { defaultOwnerPronouns } from '../owner/default-owner-pronouns';
import type { TurnMemorySettings } from '../turn/types';
import type { ItemLinkCounts } from '../types';
import { buildStubEncoder } from './build-stub-encoder';

interface StoreSettings {
  readonly erasure?: ErasureRegistry;
  readonly turn?: TurnMemorySettings;
  readonly linkCounts?: ItemLinkCounts;
}

export async function startTestMemoryStore(
  context: TasksContext,
  encoderTopics?: readonly (readonly string[])[],
  settings: StoreSettings = {},
): Promise<StartedMemoryStore> {
  const store = await startMemoryStore({
    log: context.log,
    definitions: context.definitions,
    ...(settings.erasure === undefined ? {} : { erasure: settings.erasure }),
    ...(settings.turn === undefined ? {} : { turn: settings.turn }),
    ...(settings.linkCounts === undefined ? {} : { linkCounts: settings.linkCounts }),
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
      defaultZone: 'UTC',
      limits: defaultGateLimits,
      ownerName: null,
      ownerPronouns: defaultOwnerPronouns,
      getPromptsInForce: () => ({ snapshotHash: 'sha256:test', prompts: {} }),
    },
  });

  onTestFinished(() => store.stop());

  return store;
}
