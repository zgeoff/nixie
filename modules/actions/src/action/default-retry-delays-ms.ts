import { planBackoffDelay } from '@heynixie/retry';

export const defaultRetryDelaysMs: readonly number[] = [1, 2, 3, 4].map((failures) =>
  planBackoffDelay(failures, { firstMs: 30_000, maxMs: 1_800_000, factor: 4 }),
);
