import type { Clock } from '@heynixie/clock';
import type { PartRefresh } from '@heynixie/ops';
import { checkDisk, startPartRefresh } from '@heynixie/ops';
import type { SandboxAdapter } from '@heynixie/sandbox';
import type { RefreshedPart } from './build-readiness-checks';

// impd measures the memory of each awake imp to answer, which can take longer than a probe waits,
// so readiness reads the last report of this refresh instead of calling impd.
export function startReadinessRefresh(
  adapter: Pick<SandboxAdapter, 'checkRuntime'>,
  dataDir: string,
  clock: Clock,
): PartRefresh<RefreshedPart> {
  return startPartRefresh({
    checks: {
      imp_runtime: (signal) => adapter.checkRuntime(signal),
      disk: () => checkDisk(dataDir),
    },
    clock,
    intervalMs: 5000,
    timeoutMs: 2000,
  });
}
