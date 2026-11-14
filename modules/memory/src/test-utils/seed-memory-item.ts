import type { VersionRef } from '../types';
import type { MemoryItemRequest } from './create-memory-item';
import { createMemoryItem } from './create-memory-item';
import type { MemorySeederDeps } from './memory-seeder-deps';

export function seedMemoryItem(
  deps: MemorySeederDeps,
  input: Partial<MemoryItemRequest> = {},
): Promise<VersionRef> {
  return createMemoryItem(deps.store, { text: 'Lives on Elm Street', ...input });
}
