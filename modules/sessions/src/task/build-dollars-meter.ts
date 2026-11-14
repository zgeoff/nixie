import type { LogRecord } from '@heynixie/log';
import type { ModelPrices } from '@heynixie/models';
import { buildCallCost, modelSessionSummarizedCodec, modelTurnEndedCodec } from '@heynixie/models';
import type { RunMeter } from '@heynixie/tasks';
import { readRunRecords, readTaskSetup, taskFailedTurnSpentCodec } from '@heynixie/tasks';

// The profile a task runs on gives the prices, and a task with no profile of its own runs on the
// task role's.
export type ReadRunPrices = (profile: string | null) => ModelPrices | null;

// A turn and the summary of a session count by their tokens, and a turn with no turn record counts
// through its failed turn's spend. A tally committed beside a turn record counts only what exceeds
// that record. Another task run's spend never reaches this one.
export function buildDollarsMeter(readPrices: ReadRunPrices): RunMeter {
  return {
    name: 'dollars',
    read: async (context, run) => {
      const setup = await readTaskSetup(context, run.taskID);

      const prices = readPrices(setup?.options?.profile ?? null);

      const records = await readRunRecords(context, run, [
        modelTurnEndedCodec.kind,
        modelSessionSummarizedCodec.kind,
        taskFailedTurnSpentCodec.kind,
      ]);

      let total = 0;
      let lastTurn = 0;

      for (const record of records) {
        const dollars = buildRecordDollars(record, prices);

        if (record.kind === modelTurnEndedCodec.kind) {
          total += lastTurn;
          lastTurn = dollars;
        } else if (isTallyBesideTurn(record)) {
          lastTurn = Math.max(lastTurn, dollars);
        } else {
          total += dollars;
        }
      }

      total += lastTurn;

      return total;
    },
    render: (limit) => `$${limit.toFixed(2)}`,
  };
}

// A record from an earlier release can lack a field that a later one added, so each read takes
// only the token counts, and a count the record lacks prices as nothing.
function buildRecordDollars(record: LogRecord, prices: ModelPrices | null): number {
  if (record.kind === modelTurnEndedCodec.kind) {
    return buildTokensCost(modelTurnEndedCodec.tryDecodePartial(record.payload) ?? {}, prices);
  }

  if (record.kind === taskFailedTurnSpentCodec.kind) {
    return taskFailedTurnSpentCodec.decode(record.payload).dollars;
  }

  return buildTokensCost(
    modelSessionSummarizedCodec.tryDecodePartial(record.payload)?.usage ?? {},
    prices,
  );
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

function isTallyBesideTurn(record: LogRecord): boolean {
  return (
    record.kind === taskFailedTurnSpentCodec.kind &&
    taskFailedTurnSpentCodec.decode(record.payload).besideTurnRecord === true
  );
}
