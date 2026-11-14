import type { VersionRef } from '../types';
import type { MemoryItemRequest } from './create-memory-item';
import type { MemorySeederDeps } from './memory-seeder-deps';
import { seedMemoryItem } from './seed-memory-item';

export async function seedRetiredMemoryItem(
  deps: MemorySeederDeps,
  input: Partial<MemoryItemRequest> = {},
): Promise<VersionRef> {
  const item = await seedMemoryItem(deps, input);

  return deps.store.retire({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });
}
