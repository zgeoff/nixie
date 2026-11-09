import type { LogRecord } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import type { ModelPrices } from '@heynixie/models';
import { buildCallCost, modelSessionSummarizedCodec, modelTurnEndedCodec } from '@heynixie/models';
import type { TaskLimits, TasksContext } from '@heynixie/tasks';
import {
  taskFailedTurnSpentCodec,
  taskLimitReachedCodec,
  taskStepCommittedCodec,
  taskStepErroredCodec,
  taskStepInterruptedCodec,
} from '@heynixie/tasks';

const pageSize = 500;

interface HeldPause {
  readonly stepKey: string;
  readonly turnsBefore: number;

  // the dollars the pause counted past the records before it: its turn's priced calls
  readonly dollars: number;
}

interface UsageCount {
  readonly used: TaskLimits;

  // the newest pause whose step has not ended yet
  readonly pause: HeldPause | null;
}

// A turn counts toward both limits, and a summary of the session counts only toward the dollars. A
// turn that left no turn record, such as one whose guest failed, counts its dollars through the
// limit record its pause wrote, or through its failed turn's spend when it reached no limit.
export async function readTaskUsage(
  context: Pick<TasksContext, 'log'>,
  taskID: string,
  prices: ModelPrices | null,
): Promise<TaskLimits> {
  let count: UsageCount = { used: { turns: 0, dollars: 0 }, pause: null };
  let afterSequence = 0;
  let isLastPage = false;

  while (!isLastPage) {
    const page = await readRecords(context.log, {
      afterSequence,
      thread: taskID,
      kinds: [
        'model.turn_ended',
        'model.session_summarized',
        'task.failed_turn_spent',
        'task.limit_reached',
        'task.step_committed',
        'task.step_errored',
        'task.step_interrupted',
      ],
      limit: pageSize,
    });

    for (const entry of page) {
      count = buildCountAfterRecord(count, entry.record, prices);
    }

    afterSequence = page.at(-1)?.record.sequence ?? afterSequence;
    isLastPage = page.length < pageSize;
  }

  return buildUsageWithPause(count);
}

// A retry takes its step's key, so each pause settles at its own step's end: the step's error,
// interrupt or commit, which carries the turn record that counts the turn's spend, if it has one.
function buildCountAfterRecord(
  count: UsageCount,
  record: LogRecord,
  prices: ModelPrices | null,
): UsageCount {
  if (record.kind === taskLimitReachedCodec.kind) {
    const pause = taskLimitReachedCodec.tryDecodePartial(record.payload);
    const used = buildUsageWithPause(count);

    return pause?.stepKey === undefined || pause.used === undefined
      ? { used, pause: null }
      : {
          used,
          pause: {
            stepKey: pause.stepKey,
            turnsBefore: used.turns,
            dollars: Math.max(0, pause.used.dollars - used.dollars),
          },
        };
  }

  const endedStepKey = findEndedStepKey(record);

  if (endedStepKey !== null) {
    if (count.pause?.stepKey !== endedStepKey) {
      return count;
    }

    const isTurnRecorded =
      record.kind === taskStepCommittedCodec.kind && count.used.turns > count.pause.turnsBefore;

    return { used: isTurnRecorded ? count.used : buildUsageWithPause(count), pause: null };
  }

  const counted = buildRecordUsage(record, prices);

  return {
    used: {
      turns: count.used.turns + counted.turns,
      dollars: count.used.dollars + counted.dollars,
    },
    pause: count.pause,
  };
}

function buildUsageWithPause(count: UsageCount): TaskLimits {
  return { turns: count.used.turns, dollars: count.used.dollars + (count.pause?.dollars ?? 0) };
}

function findEndedStepKey(record: LogRecord): string | null {
  if (record.kind === taskStepCommittedCodec.kind) {
    return record.stepKey;
  }

  if (record.kind === taskStepErroredCodec.kind) {
    return taskStepErroredCodec.tryDecodePartial(record.payload)?.stepKey ?? null;
  }

  if (record.kind === taskStepInterruptedCodec.kind) {
    return taskStepInterruptedCodec.tryDecodePartial(record.payload)?.stepKey ?? null;
  }

  return null;
}

// A record from an earlier release can lack a field that a later one added, so each read takes
// only the token counts, and a count the record lacks prices as nothing.
function buildRecordUsage(record: LogRecord, prices: ModelPrices | null): TaskLimits {
  if (record.kind === modelTurnEndedCodec.kind) {
    const turn = modelTurnEndedCodec.tryDecodePartial(record.payload);

    return { turns: 1, dollars: buildTokensCost(turn ?? {}, prices) };
  }

  if (record.kind === taskFailedTurnSpentCodec.kind) {
    return { turns: 0, dollars: taskFailedTurnSpentCodec.decode(record.payload).dollars };
  }

  const usage = modelSessionSummarizedCodec.tryDecodePartial(record.payload)?.usage;

  return { turns: 0, dollars: buildTokensCost(usage ?? {}, prices) };
}

interface CallTokens {
  readonly inputTokens?: number | undefined;
  readonly outputTokens?: number | undefined;
  readonly cacheReadTokens?: number | undefined;
  readonly cacheWriteTokens?: number | undefined;
}

// The records sum their calls and leave out the split of cache writes by lifetime, so the cost
// prices every cache write at the longer lifetime's price and never undercounts.
function buildTokensCost(tokens: CallTokens, prices: ModelPrices | null): number {
  if (prices === null) {
    return 0;
  }

  return buildCallCost(
    {
      uncachedInputTokens: tokens.inputTokens ?? 0,
      cacheReadTokens: tokens.cacheReadTokens ?? 0,
      cacheWrite5mTokens: 0,
      cacheWrite1hTokens: tokens.cacheWriteTokens ?? 0,
      outputTokens: tokens.outputTokens ?? 0,
    },
    prices,
  );
}
