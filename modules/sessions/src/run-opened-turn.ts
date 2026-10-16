import type { RecordInput } from '@heynixie/log';
import type { ModelRecordSource } from '@heynixie/models';
import { buildModelRecord, modelSessionOpenedCodec } from '@heynixie/models';
import type { StepResult } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { buildStepResult } from './build-step-result';
import type { SessionTurn } from './run-planned-turn';
import { runPlannedTurn } from './run-planned-turn';
import type { SessionStart } from './types';

// How the new session starts, the source its records name, and the records that go before its own
// in the commit.
export interface Opening {
  readonly source: ModelRecordSource;
  readonly start: SessionStart;
  readonly before: readonly RecordInput[];
}

// Runs the turn on a new session, which opens with the same slots whatever started it, and records
// the opening, with the persona and policy hashes it opened under. Retrieval counts what the session
// holds from this record, and the resume rule reads its persona hash.
export async function runOpenedTurn(turn: SessionTurn, opening: Opening): Promise<StepResult> {
  const source = opening.source;

  const opened = await runPlannedTurn(turn, { resume: null, start: opening.start });

  // a turn on a new session always reads its opening
  invariant(opened.opening, 'a new session ran with no opening');

  return buildStepResult(
    source,
    {
      ...opened.completed,
      memory: { ...turn.context, invalidatedThrough: turn.invalidatedThrough },
    },
    [
      ...opening.before,
      buildModelRecord(source, modelSessionOpenedCodec, {
        payload: {
          ...opened.opening,
          personaHash: turn.definitions.personaHash,
          policyHash: turn.definitions.policyHash,
        },
      }),
    ],
  );
}
