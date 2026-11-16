import { collectPieceRuns } from '../run/collect-piece-runs';
import { readRunRows } from '../run/read-run-rows';
import type { TaskReport, TasksContext } from '../types';
import { readTaskSetup } from './read-task-setup';

export interface DefinitionRunContext {
  readonly definitionHash: string;
  readonly report: { readonly mode: TaskReport; readonly target: string | null };

  // the sequence at which the piece of work of the basis task run opened: its own task run, or the
  // first of the task runs that a raise or a restart carried to it. Null before any task run.
  readonly pieceStart: number | null;
}

// What the runner of a definition's task reads by task ID alone: the version hash of the open task
// run, else of the newest one, else the hash in force. Null when the task is no definition's, or
// holds no hash at all.
export async function readDefinitionRunContext(
  context: Pick<TasksContext, 'log' | 'runners'>,
  taskID: string,
): Promise<DefinitionRunContext | null> {
  const setup = await readTaskSetup(context, taskID);

  if (setup?.kind !== 'definition') {
    return null;
  }

  const runs = await readRunRows(context.log.writer.db, taskID);

  const basis = runs.find((run) => run.ended === null) ?? runs.at(-1);
  const definitionHash = basis?.opened.definitionHash ?? setup.definitionHash;

  if (definitionHash === null) {
    return null;
  }

  return {
    definitionHash,
    report: basis?.opened.report ?? { mode: 'none', target: null },
    pieceStart:
      basis === undefined ? null : (collectPieceRuns(runs, basis).chain[0]?.openedSequence ?? null),
  };
}
