import type { RunStep, StepResult } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { codingSessionBoundCodec } from '../record/coding-session-bound-codec';
import { readBinding } from '../session/read-binding';
import { readOpenBindings } from '../session/read-open-bindings';
import { writeSessionNames } from '../session/write-session-names';
import type { CodingAdapter, CodingContext, SessionRef } from '../types';
import type { CodingStepEnd, CodingStepFacts, CodingStepPlan } from './collect-coding-step';
import { collectCodingStep } from './collect-coding-step';
import { readCodingTask } from './read-coding-task';
import { readStepFacts } from './read-step-facts';
import { renderCutText } from './render-cut-text';
import { toInboxItem } from './to-inbox-item';

// The step of a coding task. It reads what the task and the session hold, lets the pure step decide,
// and reads the session's last reply only when the session ended. An outside read that fails never
// makes it throw.
export function makeCodingStep(context: CodingContext, adapter: CodingAdapter): RunStep {
  return async (input) => {
    const log = context.tasks.log;
    const acknowledged = input.inbox.map((record) => record.sequence);

    const task = await readCodingTask(log, adapter.id, input.taskID);

    if (task === null) {
      return { next: 'wait', records: [], acknowledged };
    }

    const binding = await readBinding(log.writer.db, input.taskID);

    const inbox = input.inbox.map((record) => toInboxItem(record));

    const stored = await readStepFacts(log, {
      taskID: input.taskID,
      adapterID: adapter.id,
      binding,
      inbox,
    });

    const facts: CodingStepFacts = {
      taskID: input.taskID,
      adapterID: adapter.id,
      definitions: context.tasks.definitions(),
      reportTarget: task.reportTarget,
      ownerName: context.ownerName,
      wake: task.options.wake,
      binding,
      inbox,
      ...stored,
    };

    const plan = collectCodingStep(facts);

    await writeSpawnedName(context, adapter, plan);

    const result: StepResult = {
      next: 'wait',
      records: plan.records,
      acknowledged,
      actions: plan.actions,
      messages: plan.messages,
      ...buildBindingCheck(facts, plan, acknowledged),
    };

    if (plan.end === null) {
      return result;
    }

    const sessionID = binding?.sessionID ?? null;

    const report = await readReport(adapter, plan.end, sessionID);

    return {
      ...result,
      next: 'done',
      isFinal: true,
      run: { activity: 'worked', report },
    };
  };
}

// A session that a task just spawned gets its short ID now, so an approval card that names the
// task by its session never reads a session that has none.
async function writeSpawnedName(
  context: CodingContext,
  adapter: CodingAdapter,
  plan: CodingStepPlan,
): Promise<void> {
  const bound = plan.records.find((record) => record.kind === codingSessionBoundCodec.kind);

  if (bound === undefined) {
    return;
  }

  await writeSessionNames(
    { log: context.tasks.log, definitions: context.tasks.definitions },
    adapter.id,
    [codingSessionBoundCodec.decode(bound.payload ?? {}).sessionID],
  );
}

// A join can bind the session after the step read who binds it, so the commit reads the binding
// again in its transaction, and then commits what the step does when it reads another task's
// binding.
function buildBindingCheck(
  facts: CodingStepFacts,
  plan: CodingStepPlan,
  acknowledged: readonly number[],
): Pick<StepResult, 'resolveInCommit'> {
  const bound = plan.records.find((record) => record.kind === codingSessionBoundCodec.kind);

  if (bound === undefined) {
    return {};
  }

  const sessionID = codingSessionBoundCodec.decode(bound.payload ?? {}).sessionID;

  return {
    resolveInCommit: async (tx) => {
      const owners = await readOpenBindings(tx, facts.adapterID, [sessionID]);

      const owner = owners.get(sessionID);

      if (owner === undefined || owner === facts.taskID) {
        return null;
      }

      const refused = collectCodingStep({ ...facts, sessionOwners: owners });

      invariant(refused.end?.kind === 'report', 'a step whose session another task binds ends');

      return {
        next: 'done',
        isFinal: true,
        records: refused.records,
        acknowledged,
        actions: refused.actions,
        messages: refused.messages,
        run: { activity: 'worked', report: { summary: refused.end.summary } },
      };
    },
  };
}

const reportLimit = 8000;

interface StepReport {
  readonly summary: string;

  // set for the session's last reply, which is outside content
  readonly outside?: true;
}

async function readReport(
  adapter: CodingAdapter,
  end: CodingStepEnd,
  sessionID: string | null,
): Promise<StepReport> {
  if (end.kind === 'report') {
    return { summary: end.summary };
  }

  const fallback = { summary: 'The session ended, and nixie could not read its final reply.' };

  if (sessionID === null) {
    return fallback;
  }

  const session: SessionRef = { id: sessionID };

  const reply = await adapter.read(session, { prompt: false, tailTurns: 0 }).catch(() => null);

  if (reply?.status !== 'ok' || reply.value.lastReply === null) {
    return fallback;
  }

  return { summary: renderCutText(reply.value.lastReply, reportLimit), outside: true };
}
