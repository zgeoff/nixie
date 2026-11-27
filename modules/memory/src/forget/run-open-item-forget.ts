import type { ErasureHandle } from '@heynixie/log';
import { readLegacyOpenItemForgets } from '../item/erasure/read-legacy-open-item-forgets';
import type { ItemErasureRequest, StoreParts } from '../types';

// Runs the forget of an item that is forgetting to its end, and does nothing for one that is not.
// A forget that an earlier release left in forgetting gets its erasure first.
export async function runOpenItemForget(
  parts: StoreParts,
  erasure: ErasureHandle<ItemErasureRequest>,
  itemID: string,
): Promise<void> {
  await parts.lock(async () => {
    const legacy = await readLegacyOpenItemForgets(parts.context);

    for (const open of legacy.filter((forget) => forget.request.itemID === itemID)) {
      await erasure.begin(open.request, { by: open.by });
    }
  });

  await erasure.finish(itemID);
}
