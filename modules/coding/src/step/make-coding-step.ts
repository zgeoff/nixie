import type { RunStep, StepResult } from '@heynixie/tasks';
import { readBinding } from '../session/read-binding';
import type { CodingAdapter, CodingContext, SessionRef } from '../types';
import type { CodingStepEnd } from './collect-coding-step';
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
    const stored = await readStepFacts(log, input.taskID, binding);

    const plan = collectCodingStep({
      taskID: input.taskID,
      adapterID: adapter.id,
      definitions: context.tasks.definitions(),
      reportTarget: task.reportTarget,
      ownerName: context.ownerName,
      wake: task.options.wake,
      binding,
      inbox: input.inbox.map((record) => toInboxItem(record)),
      ...stored,
    });

    const result: StepResult = {
      next: 'wait',
      records: plan.records,
      acknowledged,
      actions: plan.actions,
      messages: plan.messages,
    };

    if (plan.end === null) {
      return result;
    }

    const sessionID = binding?.sessionID ?? null;

    const summary = await readSummary(adapter, plan.end, sessionID);

    return {
      ...result,
      next: 'done',
      isFinal: true,
      run: { activity: 'worked', report: { summary } },
    };
  };
}

const reportLimit = 8000;

async function readSummary(
  adapter: CodingAdapter,
  end: CodingStepEnd,
  sessionID: string | null,
): Promise<string> {
  if (end.kind === 'report') {
    return end.summary;
  }

  const fallback = 'The session ended, and nixie could not read its final reply.';

  if (sessionID === null) {
    return fallback;
  }

  const session: SessionRef = { id: sessionID };

  const reply = await adapter.read(session, { prompt: false, tailTurns: 0 }).catch(() => null);

  if (reply?.status !== 'ok' || reply.value.lastReply === null) {
    return fallback;
  }

  return renderCutText(reply.value.lastReply, reportLimit);
}
