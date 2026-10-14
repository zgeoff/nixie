import type { ItemIDStore } from './types';

// The item ID each ID a model passed names, in order, whether the model passed a short ID or an
// item ID. An ID that names no item stays as given, so the call reports that item as missing.
export async function readItemIDs(
  memory: Pick<ItemIDStore, 'findItemIDs'>,
  ids: readonly string[],
): Promise<readonly string[]> {
  const found = await memory.findItemIDs(ids);

  return ids.map((id) => found.get(id) ?? id);
}
