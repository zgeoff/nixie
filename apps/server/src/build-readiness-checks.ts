import type { HealthChecks, PartRefresh, PartReport } from '@heynixie/ops';
import type { StartState } from './build-start-state';

// The readiness parts that call out of the process: impd's answer and the data volume's use. A
// refresh checks them on an interval, so a readiness request never waits on impd.
export type RefreshedPart = 'imp_runtime' | 'disk';

// The readiness checks of the slice 1 parts, and the advisory part that shows failing turns without
// taking nixie out of routing. The conversation imp stays unready until the runners start, so a
// start step that fails and retries after it keeps nixie unready.
export function buildReadinessChecks(
  state: StartState,
  refresh: Pick<PartRefresh<RefreshedPart>, 'read'>,
): Pick<HealthChecks, 'readiness' | 'advisory'> {
  return {
    readiness: buildReadinessParts(state, refresh),
    advisory: {
      conversation_turns: () => Promise.resolve(state.read().turns),
    },
  };
}

function buildReadinessParts(
  state: StartState,
  refresh: Pick<PartRefresh<RefreshedPart>, 'read'>,
): HealthChecks['readiness'] {
  return {
    database: () => Promise.resolve(state.read().database),
    definitions: () => Promise.resolve(state.read().definitions),
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

// ready while impd answers and every image in the sandbox manifest is added
function buildImpHostReport(runtime: PartReport, areImagesAdded: boolean): PartReport {
  if (!runtime.isReady) {
    return runtime;
  }

  return areImagesAdded
    ? { isReady: true, reason: null }
    : { isReady: false, reason: 'the images in the sandbox manifest are not all added' };
}
