import type { Transaction } from 'kysely';
import type { TasksContext } from '../types';
import { pickCarriedLimits } from './pick-carried-limits';
import { readPieceCounts } from './read-piece-counts';
import type { TaskRun, TaskRunOpened } from './types';

export interface OpenedOrigin {
  readonly kind: string;
  readonly sequence: number | null;
}

export interface CarriedOpening {
  readonly runs: readonly TaskRun[];
  readonly carries: TaskRun;
  readonly stepKey: string;
  readonly origin: OpenedOrigin;
}

export async function readCarriedOpened(
  tx: Transaction<unknown>,
  context: Pick<TasksContext, 'log' | 'runSettings' | 'runners'>,
  opening: CarriedOpening,
): Promise<TaskRunOpened> {
  const carries = opening.carries;

  const counts = await readPieceCounts(tx, context, opening.runs, carries);

  return {
    ...carries.opened,
    runID: crypto.randomUUID(),
    openedByStep: opening.stepKey,
    origin: opening.origin,
    carriesRunID: carries.runID,
    limits: pickCarriedLimits({
      kind: opening.origin.kind === 'restart' ? 'restart' : 'raise',
      first: counts.first,
      raised: counts.raised,
      used: counts.used,
    }),
  };
}
