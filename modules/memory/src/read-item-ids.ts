import type { ItemIDStore } from './types';

export async function readItemIDs(
  memory: Pick<ItemIDStore, 'readItemIDMap'>,
  ids: readonly string[],
): Promise<readonly string[]> {
  const found = await memory.readItemIDMap(ids);

  return ids.map((id) => found.get(id) ?? id);
}
