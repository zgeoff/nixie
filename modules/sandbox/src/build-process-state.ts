import type { ProcessGroup } from './start-process-group';
import type { ToolRelay } from './start-tool-relay';
import { startToolRelay } from './start-tool-relay';
import type { ToolTarget } from './types';

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

  let isAsleep = false;
  let openedRelay: Promise<ToolRelay> | null = null;

  return {
    track: (group) => {
      groups.add(group);
      void removeOnExit(groups, group);
    },
    isAsleep: () => isAsleep,
    sleep: () => {
      isAsleep = true;

      for (const group of groups) {
        group.pause();
      }
    },
    wake: () => {
      isAsleep = false;

      for (const group of groups) {
        group.resume();
      }
    },
    openRelay: async (target) => {
      openedRelay ??= startToolRelay(target);

      const relay = await openedRelay;

      return relay.port;
    },
    stop: () =>
      stopProcesses([...groups], async () => {
        const relay = await openedRelay;

        await relay?.stop();
      }),
  };
}

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
