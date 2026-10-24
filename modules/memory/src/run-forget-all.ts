import { runForgetItems } from './run-forget-items';
import type { AllForgetRequest, StoreParts } from './types';

export function runForgetAll(
  parts: StoreParts,
  request: AllForgetRequest,
): Promise<readonly string[]> {
  return runForgetItems(parts, {
    provenance: request.provenance,
    readTargets: (db) =>
      db
        .selectFrom('memory_items')
        .select(['item_id as itemID', 'version'])
        .where('state', 'in', ['active', 'retired'])
        .orderBy('created_sequence')
        .execute(),
  });
}
