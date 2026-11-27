import { setFaultPointHandler } from '@heynixie/tasks';
import { startFaultPointFailure } from '@heynixie/tasks/test-utils';
import type { VersionRef } from '../types';
import type { MemoryItemRequest } from './create-memory-item';
import type { MemorySeederDeps } from './memory-seeder-deps';
import { seedMemoryItem } from './seed-memory-item';

export async function seedForgettingMemoryItem(
  deps: MemorySeederDeps,
  input: Partial<MemoryItemRequest> = {},
): Promise<VersionRef> {
  const item = await seedMemoryItem(deps, input);

  startFaultPointFailure('erasure.keys_removed');

  await deps.store
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

  setFaultPointHandler(null);

  return item;
}
