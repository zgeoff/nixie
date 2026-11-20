import type { StepActivity, ToolActivity } from './build-activity';
import { collectSentFiles } from './collect-sent-files';
import { collectSentMessages } from './collect-sent-messages';
import { collectWorkers } from './collect-workers';
import { formatFailureCause } from './format-failure-cause';
import type { LiveRecord } from './use-live-records';

export type StepStatus = 'done' | 'failed' | 'interrupted' | 'running';

// A segment of a split step reads its calls from the whole step, so a call keeps its result when a
// message lands between them, and it owns only the calls that first appear in its own records.
export function buildStep(
  records: readonly LiveRecord[],
  status: StepStatus,
  whole: readonly LiveRecord[] = records,
  owned?: ReadonlySet<string>,
): StepActivity {
  const task = records.find((record) => record.task !== undefined)?.task;
  const stepKey = records.find((record) => record.task?.stepKey !== undefined)?.task?.stepKey;
  const error = records.find((record) => record.task?.error !== undefined)?.task?.error;
  const reason = records.find((record) => record.task?.reason !== undefined)?.task?.reason;
  const cause = formatFailureCause(reason) ?? undefined;
  const durationMs = status === 'running' ? undefined : findDuration(records);
  const recalls = records.filter((record) => record.recall !== undefined);
  const context = records.findLast((record) => record.context !== undefined)?.context;

  const compactions = records.flatMap((record) =>
    record.compaction === undefined ? [] : [{ ...record.compaction, sequence: record.sequence }],
  );

  const summaries = records.flatMap((record) =>
    record.summary === undefined ? [] : [{ ...record.summary, sequence: record.sequence }],
  );

  const wholeCalls = collectCalls(whole);
  const wholeWorkers = collectWorkers(whole, wholeCalls);

  const workerRunIDs = new Set(wholeWorkers.map((worker) => worker.workerRunID));

  const isOwned = (callID: string): boolean => owned === undefined || owned.has(callID);
  const workers = wholeWorkers.filter((worker) => isOwned(worker.call.callID));

  const calls = wholeCalls.filter(
    (call) => isOwned(call.callID) && (call.runID === undefined || !workerRunIDs.has(call.runID)),
  );

  const sentMessages = collectSentMessages(calls);
  const sentFiles = collectSentFiles(calls);

  return {
    calls,
    ...(compactions.length === 0 ? {} : { compactions }),
    ...(summaries.length === 0 ? {} : { summaries }),
    ...(context === undefined ? {} : { context }),
    ...(durationMs === undefined ? {} : { durationMs }),
    ...(cause === undefined ? {} : { cause }),
    ...(error === undefined ? {} : { error }),
    ...(records.some((record) => record.isSilentTurn === true) ? { isSilent: true } : {}),
    key: records[0]?.sequence ?? 0,
    kind: 'step',
    ...(recalls.length === 0
      ? {}
      : { memories: recalls.flatMap((record) => record.recall?.items ?? []) }),
    records,
    ...(sentFiles.length === 0 ? {} : { sentFiles }),
    ...(sentMessages.length === 0 ? {} : { sentMessages }),
    status,
    ...(stepKey === undefined ? {} : { stepKey }),
    ...(task === undefined ? {} : { taskID: task.taskID }),
    ...(workers.length === 0 ? {} : { workers }),
  };
}

export const stepEnds: Readonly<Record<string, StepStatus>> = {
  'task.step_committed': 'done',
  'task.step_errored': 'failed',
  'task.step_interrupted': 'interrupted',
};

function findDuration(records: readonly LiveRecord[]): number | undefined {
  const started = records.find((record) => record.kind === 'task.step_started');
  const ended = records.findLast((record) => stepEnds[record.kind] !== undefined);

  return started === undefined || ended === undefined
    ? undefined
    : ended.recordedAt.getTime() - started.recordedAt.getTime();
}

function collectCalls(records: readonly LiveRecord[]): readonly ToolActivity[] {
  const calls = new Map<string, ToolActivity>();

  for (const record of records) {
    const toolCall = record.toolCall;

    if (toolCall !== undefined) {
      const earlier = calls.get(toolCall.callID);
      const clips = record.isRemoved === true ? [] : (record.clipped ?? []);
      const isInputCut = clips.some((clip) => clip.field === 'toolCall.input');
      const isContentCut = clips.some((clip) => clip.field === 'toolCall.content');

      calls.set(toolCall.callID, {
        ...earlier,
        callID: toolCall.callID,
        ...(record.isRemoved === true ? { isRemoved: true } : {}),
        ...(toolCall.runID === undefined ? {} : { runID: toolCall.runID }),
        ...(isInputCut
          ? { called: { sequence: record.sequence, thread: record.thread }, isInputCut: true }
          : {}),
        ...(isContentCut ? { isContentCut: true } : {}),
        tool: toolCall.tool ?? earlier?.tool ?? 'tool',
        ...(toolCall.input === undefined ? {} : { input: toolCall.input }),
        ...(toolCall.outcome === undefined ? {} : { outcome: toolCall.outcome }),
        ...(toolCall.content === undefined ? {} : { content: toolCall.content }),
        ...(record.kind === 'tool_result'
          ? { result: { kind: record.kind, sequence: record.sequence, thread: record.thread } }
          : {}),
      });
    }
  }

  return [...calls.values()];
}
