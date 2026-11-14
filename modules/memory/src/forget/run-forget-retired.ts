import invariant from 'tiny-invariant';
import type { RetiredForgetRequest, StoreParts } from '../types';
import { requireItem } from '../utils/item/require-item';
import { runForgetItems } from './run-forget-items';

export async function runForgetRetired(
  parts: StoreParts,
  request: RetiredForgetRequest,
): Promise<void> {
  const itemIDs = request.targets.map((target) => target.itemID);

  invariant(itemIDs.length > 0 && new Set(itemIDs).size === itemIDs.length);

  await runForgetItems(parts, {
    provenance: request.provenance,
    writeInTransaction: request.writeInTransaction,
    readTargets: async (db) => {
      for (const target of request.targets) {
        await requireItem(db, { target, operation: 'forget', states: ['retired'] });
      }

      return request.targets;
    },
  });
}
