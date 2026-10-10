import type { ToolTarget } from '@heynixie/sandbox';
import type { ProcessGroup } from './start-process-group';
import type { ToolRelay } from './start-tool-relay';
import { startToolRelay } from './start-tool-relay';

// What the double holds for one live sandbox: its process groups, whether it sleeps, and its tool
// relay. A sandbox that a restart left behind starts with none of them.
export interface ProcessState {
  readonly track: (group: ProcessGroup) => void;
  readonly isAsleep: () => boolean;
  readonly sleep: () => void;
  readonly wake: () => void;
  readonly openRelay: (target: ToolTarget) => Promise<number>;
  readonly stop: () => Promise<void>;
}

export function buildProcessState(): ProcessState {
  const groups = new Set<ProcessGroup>();
  const state = { isAsleep: false, relay: null as Promise<ToolRelay> | null };

  return {
    track: (group) => {
      groups.add(group);
      void removeOnExit(groups, group);
    },
    isAsleep: () => state.isAsleep,
    sleep: () => {
      state.isAsleep = true;
      for (const group of groups) {
        group.pause();
      }
    },
    wake: () => {
      state.isAsleep = false;
      for (const group of groups) {
        group.resume();
      }
    },
    openRelay: async (target) => {
      state.relay ??= startToolRelay(target);

      const relay = await state.relay;

      return relay.port;
    },
    stop: () =>
      stopProcesses([...groups], async () => {
        const relay = await state.relay;

        await relay?.stop();
      }),
  };
}

// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- the state's own set
async function removeOnExit(groups: Set<ProcessGroup>, group: ProcessGroup): Promise<void> {
  await group.exit;
  groups.delete(group);
}

// stops every process at once, woken first so a sleeping one takes its SIGTERM, then the relay
async function stopProcesses(
  groups: readonly ProcessGroup[],
  stopRelay: () => Promise<void>,
): Promise<void> {
  for (const group of groups) {
    group.resume();
    group.stop();
  }
  await Promise.all(groups.map((group) => group.exit));
  await stopRelay();
}
