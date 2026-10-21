import type { RecordInput } from '@heynixie/log';
import type { ModelRecordSource } from '@heynixie/models';
import { buildModelRecord, modelSessionOpenedCodec } from '@heynixie/models';
import type { StepResult } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { buildStepResult } from './build-step-result';
import type { SessionTurn } from './run-planned-turn';
import { runPlannedTurn } from './run-planned-turn';
import type { SessionStart } from './types';

export interface Opening {
  readonly source: ModelRecordSource;
  readonly start: SessionStart;
  readonly before: readonly RecordInput[];
}

export async function runOpenedTurn(turn: SessionTurn, opening: Opening): Promise<StepResult> {
  const source = opening.source;

  const opened = await runPlannedTurn(turn, { resume: null, start: opening.start });

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
