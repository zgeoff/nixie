import type { TaskRun } from './types';

export interface PieceRuns {
  // the task runs of the piece of work, oldest first
  readonly chain: readonly TaskRun[];

  // the task runs from the piece's newest restart on, or all of them when it has none
  readonly sinceRestart: readonly TaskRun[];
}

// A piece of work is a task run with each task run that a raise or a restart carried after it.
export function collectPieceRuns(runs: readonly TaskRun[], last: TaskRun): PieceRuns {
  const chain: TaskRun[] = [];
  let next: TaskRun | undefined = last;

  while (next !== undefined) {
    chain.unshift(next);

    const carriesRunID: string | null = next.opened.carriesRunID;

    next = carriesRunID === null ? undefined : runs.find((run) => run.runID === carriesRunID);
  }

  const restart = chain.findLastIndex((run) => run.opened.origin.kind === 'restart');

  return { chain, sinceRestart: chain.slice(Math.max(restart, 0)) };
}
