import type { StepInput, StepResult } from '@heynixie/tasks';
import { canSessionTake } from './can-session-take';
import { isSessionLive } from './is-session-live';
import { parseSessionBoundary } from './parse-session-boundary';
import { pickSessionPosition } from './pick-session-position';
import { readSessionMarks } from './read-session-marks';
import { runCompactionStep } from './run-compaction-step';
import { runInboxStep } from './run-inbox-step';
import type { ConversationRun } from './types';

export function runConversationStep(run: ConversationRun, input: StepInput): Promise<StepResult> {
  return run.session.withTurn(async (invalidated) => {
    const signal = AbortSignal.any([input.signal, invalidated]);
    const definitions = run.getDefinitions();

    const marks = await readSessionMarks(run.context, input.taskID);
    const catalog = await run.loadOrPinSkillCatalog?.(input.taskID);

    const skillCatalog = catalog ?? null;

    const position = pickSessionPosition({
      marks,
      personaHash: definitions.personaHash,
      boundary: parseSessionBoundary(input.sessionBoundary),
      threshold: run.compaction.threshold,
    });

    const step = { run, input, signal, definitions, skillCatalog, marks, position };

    if (isSessionLive(position) && canSessionTake(position.state, 'compact')) {
      return runCompactionStep(step, position.boundary);
    }

    if (input.inbox.length === 0) {
      return {
        next: 'wait',
        records: [],
        acknowledged: [],
        sessionBoundary: input.sessionBoundary,
      };
    }

    return runInboxStep(step, { canCompact: true, before: [] });
  });
}
