import type { HealthPart, PartCheck } from '@heynixie/ops';
import { checkDisk } from '@heynixie/ops';
import type { SandboxAdapter } from '@heynixie/sandbox';
import type { StartState } from './build-start-state';

// The readiness checks of the slice 1 parts: each reads the start state, and the imp host and
// disk parts check impd and the data volume on every request. The conversation imp stays unready
// until the runners start, so a start step that fails and retries after it keeps nixie unready.
export function buildReadinessChecks(
  state: StartState,
  adapter: Pick<SandboxAdapter, 'checkRuntime'>,
  dataDir: string,
): Readonly<Record<HealthPart, PartCheck>> {
  return {
    database: () => Promise.resolve(state.read().database),
    definitions: () => Promise.resolve(state.read().definitions),
    imp_host: async () => {
      const runtime = await adapter.checkRuntime();

      if (!runtime.isReady) {
        return runtime;
      }
      return state.read().areImagesAdded
        ? { isReady: true, reason: null }
        : { isReady: false, reason: 'the images in the sandbox manifest are not all added' };
    },
    conversation_imp: () => {
      const reports = state.read();
      const report =
        !reports.conversation.isReady || reports.areRunnersStarted
          ? reports.conversation
          : { isReady: false, reason: 'the runners have not started' };

      return Promise.resolve(report);
    },
    disk: () => checkDisk(dataDir),
  };
}
