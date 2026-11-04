// @boundaries-ignore a spike imports the repo's process stop by path
import { stopProcesses } from '../../../libs/testing/src/stop-processes';

export interface ProcessGroup<Out extends Bun.Spawn.Readable, Err extends Bun.Spawn.Readable> {
  readonly child: Bun.Subprocess<'ignore', Out, Err>;
  readonly stop: () => Promise<void>;
}

const liveLeaderPIDs = new Set<number>();

// A detached group misses the Ctrl-C that a terminal sends to the test runner's group, and outlives
// a runner that a signal ends, so a signal to the runner stops every live group first.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    stopProcesses([...liveLeaderPIDs]);
    process.kill(process.pid, signal);
  });
}

// A kill of the leader alone leaves the processes it started running, so the stop kills the group.
export function startProcessGroup<
  const Out extends Bun.Spawn.Readable,
  const Err extends Bun.Spawn.Readable,
>(argv: string[], options: Bun.Spawn.SpawnOptions<'ignore', Out, Err>): ProcessGroup<Out, Err> {
  const child = Bun.spawn(argv, { ...options, stdin: 'ignore', detached: true });

  liveLeaderPIDs.add(child.pid);

  return {
    child,
    stop: async () => {
      stopProcesses([child.pid]);
      await child.exited;
      liveLeaderPIDs.delete(child.pid);
    },
  };
}
