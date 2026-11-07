import type { LogRecord } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import type { ModelPrices } from '@heynixie/models';
import { buildCallCost, modelSessionSummarizedCodec, modelTurnEndedCodec } from '@heynixie/models';
import type { TaskLimits, TasksContext } from '@heynixie/tasks';
import { taskLimitReachedCodec } from '@heynixie/tasks';

const pageSize = 500;

// A turn counts toward both limits, and a summary of the session counts only toward the dollars. A
// turn that ended in no turn record, such as one whose guest failed, counts through the limit
// record its pause wrote.
export async function readTaskUsage(
  context: Pick<TasksContext, 'log'>,
  taskID: string,
  prices: ModelPrices | null,
): Promise<TaskLimits> {
  let used = { turns: 0, dollars: 0 };
  let afterSequence = 0;
  let isLastPage = false;

  while (!isLastPage) {
    const page = await readRecords(context.log, {
      afterSequence,
      thread: taskID,
      kinds: ['model.turn_ended', 'model.session_summarized', 'task.limit_reached'],
      limit: pageSize,
    });

    for (const entry of page) {
      used = buildUsageAfterRecord(used, entry.record, prices);
    }

    afterSequence = page.at(-1)?.record.sequence ?? afterSequence;
    isLastPage = page.length < pageSize;
  }

  return used;
}

// A pause records the task's whole use at its turn's end, and commits before that turn's record. A
// pause after a turn that ended counts one turn more than the count so far, and that turn's record
// counts its spend. A pause at the same count holds the spend of a turn that left no record.
function buildUsageAfterRecord(
  used: TaskLimits,
  record: LogRecord,
  prices: ModelPrices | null,
): TaskLimits {
  if (record.kind === taskLimitReachedCodec.kind) {
    const reached = taskLimitReachedCodec.tryDecodePartial(record.payload)?.used;

    return reached?.turns === used.turns && reached.dollars > used.dollars
      ? { turns: used.turns, dollars: reached.dollars }
      : used;
  }

  const counted = buildRecordUsage(record, prices);

  return { turns: used.turns + counted.turns, dollars: used.dollars + counted.dollars };
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
