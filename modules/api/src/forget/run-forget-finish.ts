import { toErrorFields } from '@heynixie/logger';
import type { ForgetStatus } from '@heynixie/memory';
import type { APIContext, ViewMemoryStore } from '../types';

// Runs every step after the start of each item's forget, and reports where each item stands. When a
// step fails, the forget stays open and the items it did not reach read as pending, so the route
// replies pending and a retry finishes the rest.
export async function runForgetFinish(
  context: APIContext,
  store: ViewMemoryStore,
  itemIDs: readonly string[],
): Promise<ForgetStatus> {
  try {
    return await store.finishForgets(itemIDs);
  } catch (error) {
    context.logger?.(
      'memory.forget_pending',
      { itemIDs: itemIDs.join(','), ...toErrorFields(error) },
      'error',
    );

    return store.view.readForgetStatus(itemIDs);
  }
}
