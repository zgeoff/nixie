import { modelTurnEndedCodec } from '@heynixie/models';
import type { StepInput, StepResult } from '@heynixie/tasks';
import { buildStepRunID, readTaskDirectory } from '@heynixie/tasks';
import { canSessionTake } from './can-session-take';
import { isSessionLive } from './is-session-live';
import { isStepTurnCut } from './is-step-turn-cut';
import { isTaskWorkCut } from './is-task-work-cut';
import { openStepCapture } from './open-step-capture';
import { parseSessionBoundary } from './parse-session-boundary';
import { pickSessionPosition } from './pick-session-position';
import type { SessionMarks } from './read-session-marks';
import { readSessionMarks } from './read-session-marks';
import { runCompactionStep } from './run-compaction-step';
import { runInboxStep } from './run-inbox-step';
import type { ConversationRun, SessionFrame, SessionStep } from './types';

// One capture covers the whole step: a threshold compaction, the turn, an overflow compaction and a
// rebuilt turn all share it. The step closes it with the count of model calls it made.
export async function runConversationStep(
  conversation: ConversationRun,
  input: StepInput,
): Promise<StepResult> {
  const capture = await openStepCapture(conversation.turnInputs, {
    step: { taskID: input.taskID, stepRunID: buildStepRunID(input) },
    profile: conversation.profile.profile,
    role: conversation.frame.kind === 'task' ? 'task' : 'conversation',
  });

  const calls = { count: 0 };

  const captured: ConversationRun = {
    ...conversation,
    turnProfile: { ...conversation.turnProfile, baseURL: capture.baseURL },
    onModelCall: async (usage) => {
      calls.count += 1;

      await conversation.onModelCall?.(usage);
    },
  };

  try {
    return await runSessionTurn(captured, input);
  } finally {
    await capture.close({ callFrames: calls.count });
  }
}

function runSessionTurn(conversation: ConversationRun, input: StepInput): Promise<StepResult> {
  return conversation.session.withTurn(async (invalidated) => {
    const signal = AbortSignal.any([input.signal, invalidated]);
    const definitions = conversation.getDefinitions();

    const run = {
      ...conversation,
      messaging: await readTaskDirectory(conversation.context, conversation.messaging),
    };

    const marks = await readSessionMarks(run.context, input.taskID);
    const catalog = await run.loadOrPinSkillCatalog?.(input.taskID);

    const skillCatalog = catalog ?? null;

    const position = pickSessionPosition({
      marks,
      personaHash: definitions.personaHash,
      isTask: run.frame.kind === 'task',
      boundary: parseSessionBoundary(input.sessionBoundary),
      threshold: run.compaction.threshold,
    });

    const step = { run, input, signal, definitions, skillCatalog, marks, position };

    const result = await runSessionStep(step);

    return run.frame.kind === 'task' && isStepTurnCut(input.interrupt, result.records)
      ? buildCutResult(result)
      : result;
  });
}

function runSessionStep(step: SessionStep): Promise<StepResult> {
  const frame = step.run.frame;

  if (isSessionLive(step.position) && canSessionTake(step.position.state, 'compact')) {
    return runCompactionStep(step, step.position.boundary);
  }

  if (
    step.input.inbox.length === 0 &&
    !isTaskStart(frame, step.marks) &&
    !isTaskWorkCut(frame, step.marks)
  ) {
    return Promise.resolve({
      next: 'wait',
      records: [],
      acknowledged: [],
      sessionBoundary: step.input.sessionBoundary,
    });
  }

  return runInboxStep(step, { canCompact: true, before: [] });
}

// A started task's brief is its first piece of work, and it arrives in no inbox record. A forget can
// invalidate the task before its first session opens, so the test is the opening and not the state.
function isTaskStart(frame: SessionFrame, marks: SessionMarks): boolean {
  return frame.kind === 'task' && marks.sessionKey === null;
}

// A turn that the call guard or a refusal ended also stops before end_turn, so the step marks the
// interrupt on the turn record, and a later step with no message continues only a marked turn.
function buildCutResult(result: StepResult): StepResult {
  return {
    ...result,
    next: 'continue',
    records: result.records.map((record) =>
      record.kind === modelTurnEndedCodec.kind
        ? { ...record, payload: { ...record.payload, isInterrupted: true } }
        : record,
    ),
  };
}
