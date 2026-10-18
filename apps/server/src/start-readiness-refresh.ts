import type { Clock } from '@heynixie/clock';
import type { PartRefresh } from '@heynixie/ops';
import { checkDisk, startPartRefresh } from '@heynixie/ops';
import type { SandboxAdapter } from '@heynixie/sandbox';
import type { RefreshedPart } from './build-readiness-checks';

// Checks impd and the data volume every 5 s, well inside a probe's period, so readiness reads their
// last reports. impd measures the memory of each awake imp to answer, which can take longer than a
// probe waits, so a probe that called impd itself timed out while nixie was ready.
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
