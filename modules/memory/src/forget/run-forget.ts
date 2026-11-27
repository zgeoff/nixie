import type { ErasureHandle } from '@heynixie/log';
import type { ForgetRequest, ItemErasureRequest, StoreParts } from '../types';
import { runItemForgets } from './run-item-forgets';

// Runs the forget of one item to its end.
export async function runForget(
  parts: StoreParts,
  erasure: ErasureHandle<ItemErasureRequest>,
  request: ForgetRequest,
): Promise<void> {
  await runItemForgets(parts, erasure, {
    provenance: request.provenance,
    writeInTransaction: request.writeInTransaction,
    isFinishDeferred: request.isFinishDeferred,
    readRequests: () =>
      Promise.resolve([
        {
          itemID: request.target.itemID,
          revision: request.target.version,
          states: ['active', 'retired'],
        },
      ]),
  });
}
