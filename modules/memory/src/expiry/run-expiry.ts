import type { ErasureHandle } from '@heynixie/log';
import type { ExpiryRequest } from './build-expiry-erasable';

export interface ExpiryOptions {
  readonly nowMs: number;

  // how old a payload is when it expires
  readonly expireAfterMs: number;

  // the most keys one erasure names, so a long backlog takes several short erasures
  readonly batchSize: number;
}

export const defaultExpiryBatchSize = 500;

// Expires every old payload that remains, one batch at a time. Each batch is an erasure that
// finishes before the next one begins, so a crash leaves at most one open, which the next start
// finishes. Returns how many batches ran.
export async function runExpiry(
  handle: ErasureHandle<ExpiryRequest>,
  options: ExpiryOptions,
): Promise<number> {
  let batches = 0;
  let afterSequence = 0;

  for (;;) {
    const begun = await handle.begin(
      { cutoffMs: options.nowMs - options.expireAfterMs, afterSequence, limit: options.batchSize },
      { by: 'system' },
    );

    if (begun.status === 'refused') {
      return batches;
    }

    await handle.finish(begun.target.targetID);

    batches += 1;
    afterSequence = Number(begun.target.targetID);
  }
}
