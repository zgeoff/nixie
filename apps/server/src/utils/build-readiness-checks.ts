import type { Clock } from '@heynixie/clock';
import type { HealthChecks, PartRefresh, PartReport } from '@heynixie/ops';
import { buildBackupsReport } from './build-backups-report';
import type { StartState } from './build-start-state';

export type RefreshedPart = 'imp_runtime' | 'disk';

export function buildReadinessChecks(
  state: StartState,
  refresh: Pick<PartRefresh<RefreshedPart>, 'read'>,
  clock: Pick<Clock, 'now'>,
): Pick<HealthChecks, 'readiness' | 'dependencies' | 'advisory'> {
  return {
    readiness: {
      database: () => Promise.resolve(state.read().database),
      definitions: () => Promise.resolve(state.read().definitions),
    },
    dependencies: buildDependencyParts(state, refresh, clock),
    advisory: {
      conversation_turns: () => Promise.resolve(state.read().turns),
    },
  };
}

function buildDependencyParts(
  state: StartState,
  refresh: Pick<PartRefresh<RefreshedPart>, 'read'>,
  clock: Pick<Clock, 'now'>,
): HealthChecks['dependencies'] {
  return {
    imp_host: () =>
      Promise.resolve(buildImpHostReport(refresh.read('imp_runtime'), state.read().images)),
    conversation_imp: () => {
      const reports = state.read();

      const report =
        !reports.conversation.isReady || reports.areRunnersStarted
          ? reports.conversation
          : { isReady: false, reason: 'the runners have not started' };

      return Promise.resolve(report);
    },
    disk: () => Promise.resolve(refresh.read('disk')),
    backups: () => Promise.resolve(buildBackupsReport(state.read().backups, clock.now())),
  };
}

function buildImpHostReport(runtime: PartReport, images: PartReport): PartReport {
  return runtime.isReady ? images : runtime;
}
