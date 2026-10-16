import type { HealthChecks } from '@heynixie/ops';
import { checkDisk } from '@heynixie/ops';
import type { SandboxAdapter } from '@heynixie/sandbox';
import type { StartState } from './build-start-state';

// The readiness checks of the slice 1 parts, and the advisory part that shows failing turns without
// taking nixie out of routing. The conversation imp stays unready until the runners start, so a
// start step that fails and retries after it keeps nixie unready.
export function buildReadinessChecks(
  state: StartState,
  adapter: Pick<SandboxAdapter, 'checkRuntime'>,
  dataDir: string,
): Pick<HealthChecks, 'readiness' | 'advisory'> {
  return {
    readiness: buildReadinessParts(state, adapter, dataDir),
    advisory: {
      conversation_turns: () => Promise.resolve(state.read().turns),
    },
  };
}

function buildReadinessParts(
  state: StartState,
  adapter: Pick<SandboxAdapter, 'checkRuntime'>,
  dataDir: string,
): HealthChecks['readiness'] {
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
