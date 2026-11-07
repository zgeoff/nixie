import type { LogRecord } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import type { ModelPrices } from '@heynixie/models';
import { buildCallCost, modelSessionSummarizedCodec, modelTurnEndedCodec } from '@heynixie/models';
import type { TaskLimits, TasksContext } from '@heynixie/tasks';
import {
  taskLimitReachedCodec,
  taskLimitsRaisedCodec,
  taskStepCommittedCodec,
} from '@heynixie/tasks';

const pageSize = 500;

interface HeldPause {
  readonly stepKey: string;
  readonly reached: TaskLimits;
  readonly turnsBefore: number;
}

interface UsageCount {
  readonly used: TaskLimits;

  // the newest pause whose step has not committed yet
  readonly pause: HeldPause | null;
}

// A turn counts toward both limits, and a summary of the session counts only toward the dollars. A
// turn that left no turn record, such as one whose guest failed, counts through the limit record
// its pause wrote.
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
        'task.limit_reached',
        'task.limits_raised',
        'task.step_committed',
      ],
      limit: pageSize,
    });

    for (const entry of page) {
      count = buildCountAfterRecord(count, entry.record, prices);
    }

    afterSequence = page.at(-1)?.record.sequence ?? afterSequence;
    isLastPage = page.length < pageSize;
  }

  return buildSettledUsage(count);
}

// A pause records the task's whole use at its turn's end, and commits before its step's commit. A
// step that commits a turn record counts that turn's spend through it. A pause whose step commits
// no turn record, or never commits, holds the only count of that turn's spend.
function buildCountAfterRecord(
  count: UsageCount,
  record: LogRecord,
  prices: ModelPrices | null,
): UsageCount {
  if (record.kind === taskLimitReachedCodec.kind) {
    const pause = taskLimitReachedCodec.tryDecodePartial(record.payload);
    const used = buildSettledUsage(count);

    return pause?.stepKey === undefined || pause.used === undefined
      ? { used, pause: null }
      : { used, pause: { stepKey: pause.stepKey, reached: pause.used, turnsBefore: used.turns } };
  }

  if (record.kind === taskLimitsRaisedCodec.kind) {
    return { used: buildSettledUsage(count), pause: null };
  }

  if (record.kind === taskStepCommittedCodec.kind) {
    if (count.pause?.stepKey !== record.stepKey) {
      return count;
    }

    return count.used.turns > count.pause.turnsBefore
      ? { used: count.used, pause: null }
      : { used: buildSettledUsage(count), pause: null };
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

function buildSettledUsage(count: UsageCount): TaskLimits {
  const reached = count.pause?.reached.dollars ?? 0;

  return reached > count.used.dollars ? { ...count.used, dollars: reached } : count.used;
}

// A record from an earlier release can lack a field that a later one added, so each read takes
// only the token counts, and a count the record lacks prices as nothing.
function buildRecordUsage(record: LogRecord, prices: ModelPrices | null): TaskLimits {
  if (record.kind === modelTurnEndedCodec.kind) {
    const turn = modelTurnEndedCodec.tryDecodePartial(record.payload);

    return { turns: 1, dollars: buildTokensCost(turn ?? {}, prices) };
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
