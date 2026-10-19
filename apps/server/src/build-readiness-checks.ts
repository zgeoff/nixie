import type { HealthChecks, PartRefresh, PartReport } from '@heynixie/ops';
import type { StartState } from './build-start-state';

// The readiness parts that call out of the process: impd's answer and the data volume's use. A
// refresh checks them on an interval, so a readiness request never waits on impd.
export type RefreshedPart = 'imp_runtime' | 'disk';

// The readiness checks of the slice 1 parts, the dependency parts and the advisory part. The
// conversation imp stays unready until the runners start, so a start step that fails and retries
// after it keeps nixie degraded.
export function buildReadinessChecks(
  state: StartState,
  refresh: Pick<PartRefresh<RefreshedPart>, 'read'>,
): Pick<HealthChecks, 'readiness' | 'dependencies' | 'advisory'> {
  return {
    readiness: {
      database: () => Promise.resolve(state.read().database),
      definitions: () => Promise.resolve(state.read().definitions),
    },
    dependencies: buildDependencyParts(state, refresh),
    advisory: {
      conversation_turns: () => Promise.resolve(state.read().turns),
    },
  };
}

function buildDependencyParts(
  state: StartState,
  refresh: Pick<PartRefresh<RefreshedPart>, 'read'>,
): HealthChecks['dependencies'] {
  return {
    imp_host: () =>
      Promise.resolve(buildImpHostReport(refresh.read('imp_runtime'), state.read().areImagesAdded)),
    conversation_imp: () => {
      const reports = state.read();

      const report =
        !reports.conversation.isReady || reports.areRunnersStarted
          ? reports.conversation
          : { isReady: false, reason: 'the runners have not started' };

      return Promise.resolve(report);
    },
    disk: () => Promise.resolve(refresh.read('disk')),
  };
}

function buildImpHostReport(runtime: PartReport, areImagesAdded: boolean): PartReport {
  if (!runtime.isReady) {
    return runtime;
  }

  return areImagesAdded
    ? { isReady: true, reason: null }
    : { isReady: false, reason: 'the images in the sandbox manifest are not all added' };
}
