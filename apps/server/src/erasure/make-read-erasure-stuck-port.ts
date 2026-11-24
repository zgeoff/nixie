import type { ErasureStuckPort } from '@heynixie/api';
import type { ErasureRunnerControl } from '@heynixie/log';
import type { ErasureStuckPortOptions } from './build-erasure-stuck-port';
import { buildErasureStuckPort } from './build-erasure-stuck-port';

// The runner starts after the API context and the tools, so each reader asks for it at call time
// and answers null until it exists.
export function makeReadErasureStuckPort(
  findRunner: () => Pick<ErasureRunnerControl, 'readStuck' | 'retryStuck'> | null,
  options: ErasureStuckPortOptions,
): () => ErasureStuckPort | null {
  return () => {
    const runner = findRunner();

    return runner === null ? null : buildErasureStuckPort(runner, options);
  };
}
