import type { StepResult } from '@heynixie/tasks';
import type { SessionPoint } from '@heynixie/wire';
import type { ModelRecordSource } from './build-model-record';
import { buildModelRecord } from './build-model-record';
import { buildStepResult } from './build-step-result';
import type { SessionTurn } from './run-planned-turn';
import { runPlannedTurn } from './run-planned-turn';

// the session a rebuild replaced, and why
export interface LostSession {
  readonly reason: 'invalidated' | 'missing';
  readonly lost: SessionPoint;
}

// Runs the turn on a new session whose first turn carries the recent turns, and records the
// session it replaced. A first turn, with no session to lose, starts the same way unrecorded.
export async function runRebuiltTurn(
  turn: SessionTurn,
  source: ModelRecordSource,
  lost: LostSession | null,
): Promise<StepResult> {
  const rebuilt = await runPlannedTurn(turn, null);
  const before =
    lost === null
      ? []
      : [
          buildModelRecord(source, 'model.session_rebuilt', {
            payload: {
              reason: lost.reason,
              lostSessionID: lost.lost.sessionID,
              recentRecords: rebuilt.recentRecords,
            },
          }),
        ];

  return buildStepResult(
    source,
    {
      ...rebuilt.completed,
      memory: { ...turn.context, invalidatedThrough: turn.invalidatedThrough },
    },
    before,
  );
}
