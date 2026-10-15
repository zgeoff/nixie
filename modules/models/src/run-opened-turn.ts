import type { StepResult } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import type { ModelRecordSource } from './build-model-record';
import { buildModelRecord } from './build-model-record';
import { buildStepResult } from './build-step-result';
import type { SessionTurn } from './run-planned-turn';
import { runPlannedTurn } from './run-planned-turn';
import type { SessionStart } from './types';

// Runs the turn on a new session, which opens with the same slots whatever started it, and records
// the opening: the start, the summary it used, the turns and events it carried again, and the status
// values. Retrieval counts what the session holds from this record.
export async function runOpenedTurn(
  turn: SessionTurn,
  source: ModelRecordSource,
  start: SessionStart,
): Promise<StepResult> {
  const opened = await runPlannedTurn(turn, { resume: null, start });

  // a turn on a new session always reads its opening
  invariant(opened.opening, 'a new session ran with no opening');

  return buildStepResult(
    source,
    {
      ...opened.completed,
      memory: { ...turn.context, invalidatedThrough: turn.invalidatedThrough },
    },
    [buildModelRecord(source, 'model.session_opened', { payload: { ...opened.opening } })],
  );
}
