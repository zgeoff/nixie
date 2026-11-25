import type { RecordInput } from '@heynixie/log';
import type { ModelRecordSource } from '@heynixie/models';
import { buildModelEventRecord, modelSessionOpenedCodec } from '@heynixie/models';
import type { StepResult } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { buildStepResult } from '../step/build-step-result';
import type { SessionStart } from '../types';
import type { SessionTurn } from './run-planned-turn';
import { runPlannedTurn } from './run-planned-turn';
import { runStepCommit } from './run-step-commit';

export interface Opening {
  readonly source: ModelRecordSource;
  readonly start: SessionStart;
  readonly before: readonly RecordInput[];
}

export async function runOpenedTurn(turn: SessionTurn, opening: Opening): Promise<StepResult> {
  const source = opening.source;

  const opened = await runPlannedTurn(turn, { resume: null, start: opening.start });

  invariant(opened.opening, 'a new session ran with no opening');

  const completed = {
    ...opened.completed,
    harness: turn.run.harness,
    prices: turn.run.profile.profile.prices,
    memory: { ...turn.context, invalidatedThrough: turn.invalidatedThrough },
  };

  const sessionOpened = buildModelEventRecord(source, modelSessionOpenedCodec, {
    ...opened.opening,
    personaHash: turn.definitions.personaHash,
    policyHash: turn.definitions.policyHash,
    sessionKey: turn.sessionKey,
  });

  return runStepCommit(turn, completed, () =>
    buildStepResult(source, completed, [...opening.before, sessionOpened]),
  );
}
