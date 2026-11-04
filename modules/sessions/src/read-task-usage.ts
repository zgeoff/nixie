import { readRecords } from '@heynixie/log';
import type { ModelPrices } from '@heynixie/models';
import { buildCallCost, modelTurnEndedCodec } from '@heynixie/models';
import type { TaskLimits, TasksContext } from '@heynixie/tasks';

const pageSize = 500;

// The turn record sums a turn's calls and leaves out their split by cache lifetime, so the cost
// prices every cache write at the 1-hour price and never undercounts.
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
      kinds: ['model.turn_ended'],
      limit: pageSize,
    });

    for (const entry of page) {
      const turn = modelTurnEndedCodec.decode(entry.record.payload);

      const cost =
        prices === null
          ? 0
          : buildCallCost(
              {
                input_tokens: turn.inputTokens,
                output_tokens: turn.outputTokens,
                cache_read_input_tokens: turn.cacheReadTokens,
                cache_creation_input_tokens: turn.cacheWriteTokens,
              },
              prices,
            );

      used = { turns: used.turns + 1, dollars: used.dollars + cost };
    }

    afterSequence = page.at(-1)?.record.sequence ?? afterSequence;
    isLastPage = page.length < pageSize;
  }

  return used;
}
