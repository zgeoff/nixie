import type { LogRecord } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import type { ModelPrices } from '@heynixie/models';
import { buildCallCost, modelSessionSummarizedCodec, modelTurnEndedCodec } from '@heynixie/models';
import type { TaskLimits, TasksContext } from '@heynixie/tasks';

const pageSize = 500;

// A turn counts toward both limits, and a summary of the session counts only toward the dollars.
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
      kinds: ['model.turn_ended', 'model.session_summarized'],
      limit: pageSize,
    });

    for (const entry of page) {
      const counted = buildRecordUsage(entry.record, prices);

      used = { turns: used.turns + counted.turns, dollars: used.dollars + counted.dollars };
    }

    afterSequence = page.at(-1)?.record.sequence ?? afterSequence;
    isLastPage = page.length < pageSize;
  }

  return used;
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
      input_tokens: tokens.inputTokens ?? 0,
      output_tokens: tokens.outputTokens ?? 0,
      cache_read_input_tokens: tokens.cacheReadTokens ?? 0,
      cache_creation_input_tokens: tokens.cacheWriteTokens ?? 0,
    },
    prices,
  );
}
