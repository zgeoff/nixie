import type { Clock } from '@heynixie/clock';
import type { Writer } from '@heynixie/log';
import type { Logger } from '@heynixie/logger';
import { checkDatabase, createHealthApp } from '@heynixie/ops';
import type { SandboxAdapter } from '@heynixie/sandbox';
import { buildReadinessChecks } from './build-readiness-checks';
import type { StartState } from './build-start-state';
import { startReadinessRefresh } from './start-readiness-refresh';
import type { Cleanup } from './types';

export interface ServerHealthOptions {
  readonly writer: Pick<Writer, 'db'>;
  readonly state: StartState;
  readonly adapter: Pick<SandboxAdapter, 'checkRuntime'>;
  readonly dataDir: string;
  readonly clock: Clock;
  readonly cleanup: Pick<Cleanup, 'defer'>;
  readonly log: Logger;
}

// Starts the readiness refresh and builds the health endpoint on it. Liveness holds while the
// process answers and the database opens; readiness lists the slice 1 parts, the dependency parts
// and the advisory ones.
export async function startServerHealth(options: ServerHealthOptions) {
  const refresh = startReadinessRefresh(options.adapter, options.dataDir, options.clock);

  await options.cleanup.defer(refresh.stop);

  return createHealthApp({
    liveness: {
      database: () => checkDatabase(options.writer.db),
    },
    ...buildReadinessChecks(options.state, refresh),
    log: options.log,
  });
}
