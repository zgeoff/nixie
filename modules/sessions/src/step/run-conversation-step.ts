import { modelTurnEndedCodec } from '@heynixie/models';
import { checkSpendTurns } from '@heynixie/spend';
import type { StepInput, StepResult } from '@heynixie/tasks';
import {
  buildStepRunID,
  readTaskDirectory,
  readTaskGateSnapshot,
  readUnlistedProfiles,
} from '@heynixie/tasks';
import { match } from 'ts-pattern';
import { runCompactionStep } from '../compaction/run-compaction-step';
import { runInboxStep } from '../inbox/run-inbox-step';
import { canSessionTake } from '../session/can-session-take';
import { isSessionLive } from '../session/is-session-live';
import { resolvePlanTurnProfile } from '../turn/resolve-plan-turn-profile';
import type { ConversationRun, SessionFrame, SessionStep } from '../types';
import { isTaskWorkCut } from '../utils/is-task-work-cut';
import { openStepCapture } from '../utils/open-step-capture';
import { parseSessionBoundary } from '../utils/parse-session-boundary';
import type { SessionMarks } from '../utils/read-session-marks';
import { readSessionMarks } from '../utils/read-session-marks';
import { isStepTurnCut } from './is-step-turn-cut';
import { pickSessionPosition } from './pick-session-position';
import { voidLostReplies } from './void-lost-replies';

// One capture covers the whole step: a threshold compaction, the turn, an overflow compaction and a
// rebuilt turn all share it. The step closes it with the count of model calls it made.
export async function runConversationStep(
  conversation: ConversationRun,
  input: StepInput,
): Promise<StepResult> {
  // a runner that died mid-turn left replies that no commit kept, and no later read may see them
  await voidLostReplies(conversation, input);

  const stopped = await runSpendCheck(conversation, input);

  if (stopped !== null) {
    return stopped;
  }

  // a plan profile whose login the gateway does not hold fails the step before any capture opens
  const turnProfile = resolvePlanTurnProfile({
    turnProfile: conversation.turnProfile,
    profile: conversation.profile.profile,
    spend: conversation.spend,
  });

  const capture = await openStepCapture(conversation.turnInputs, {
    step: { taskID: input.taskID, stepRunID: buildStepRunID(input) },
    profile: conversation.profile.profile,
    role: pickCaptureRole(conversation.frame),
    isRewritten: conversation.harness.rewritesRequests,
  });

  const calls = { count: 0 };

  const captured: ConversationRun = {
    ...conversation,
    turnProfile: { ...turnProfile, baseURL: capture.baseURL },
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

// The step start: it trips the stop at a turn limit, then reads the gate. A step held for the stop
// ends before a capture, an approved call or a model turn, and commits nothing. The task keeps its
// work and queued calls, and the claim filter holds its next claim until the clear.
async function runSpendCheck(
  conversation: ConversationRun,
  input: StepInput,
): Promise<StepResult | null> {
  if (conversation.spend !== undefined) {
    await checkSpendTurns(conversation.spend);
  }

  const gate = await readTaskGateSnapshot(conversation.context, input.taskID);

  if (gate.open || gate.reason !== 'spend') {
    return null;
  }

  return {
    next: 'continue',
    records: [],
    acknowledged: [],
    sessionBoundary: input.sessionBoundary,
    isHeld: true,
  };
}

function pickCaptureRole(frame: SessionFrame): 'task' | 'call' | 'conversation' {
  return match(frame)
    .with({ kind: 'task' }, () => 'task' as const)
    .with({ kind: 'call' }, () => 'call' as const)
    .with({ kind: 'conversation' }, () => 'conversation' as const)
    .exhaustive();
}

function runSessionTurn(conversation: ConversationRun, input: StepInput): Promise<StepResult> {
  return conversation.session.withTurn(
    async (invalidated) => {
      const signal = AbortSignal.any([input.signal, invalidated]);
      const definitions = conversation.getDefinitions();

      const listed = await readTaskDirectory(conversation.context, conversation.messaging);

      const run = {
        ...conversation,
        messaging: {
          ...listed,
          unlisted: await readUnlistedProfiles(conversation.context, listed.directory),
        },
      };

      const marks = await readSessionMarks(run.context, input.taskID, run.sinceSequence);
      const catalog = await run.loadOrPinSkillCatalog?.(input.taskID);

      const skillCatalog = catalog ?? null;

      const position = pickSessionPosition({
        marks,
        personaHash: definitions.personaHash,
        isTask: run.frame.kind === 'task',

        // A run of a fresh window that has opened no session yet holds a point of an earlier run's.
        boundary:
          run.sinceSequence !== undefined && !marks.hasOpening
            ? null
            : parseSessionBoundary(input.sessionBoundary),
        session: run.harness.session,
        capabilities: run.harness.capabilities,
        threshold: run.compaction.threshold,
      });

      const step = { run, input, signal, definitions, skillCatalog, marks, position };

      const result = await runSessionStep(step);

      const settled =
        run.frame.kind === 'task' && isStepTurnCut(input.interrupt, result.records)
          ? buildCutResult(result)
          : result;

      return keepApprovedCallsReady(run, input.taskID, settled);
    },
    { stepKey: input.stepKey, generation: input.lease.generation },
  );
}

async function runSessionStep(step: SessionStep): Promise<StepResult> {
  const frame = step.run.frame;

  if (isSessionLive(step.position) && canSessionTake(step.position.state, 'compact')) {
    return runCompactionStep(step, step.position.boundary);
  }

  // an approved call that no step ran has a result to read, though the inbox holds no record
  const hasApprovedCall = (await step.run.inStepActions?.probePending(step.input.taskID)) === true;

  if (
    step.input.inbox.length === 0 &&
    !hasApprovedCall &&
    !isTaskStart(frame, step.marks) &&
    !isTaskWorkCut(frame, step.marks)
  ) {
    return {
      next: 'wait',
      records: [],
      acknowledged: [],
      sessionBoundary: step.input.sessionBoundary,
    };
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

// An approved call that this step has not run, such as one whose approval reached a turn that was
// already running, keeps the task ready: the next step runs it before its turn.
async function keepApprovedCallsReady(
  run: ConversationRun,
  taskID: string,
  result: StepResult,
): Promise<StepResult> {
  const isEnding = result.next === 'wait' || result.next === 'done';

  if (!isEnding) {
    return result;
  }

  const probe = await run.inStepActions?.probePending(taskID);

  if (probe !== true) {
    return result;
  }

  return { ...result, next: 'continue' };
}
