import { pickTaskRunMicros } from '@heynixie/budgets';
import type { LogRecord } from '@heynixie/log';
import type { ModelPrices, TokenCounts } from '@heynixie/models';
import {
  buildTokensCost,
  modelSessionSummarizedCodec,
  modelTurnEndedCodec,
} from '@heynixie/models';
import type { RunMeter, TaskRun, TasksContext } from '@heynixie/tasks';
import {
  readMeterReads,
  readRunRecords,
  readTaskSetup,
  taskFailedTurnSpentCodec,
} from '@heynixie/tasks';
import { workerGatewayChargedCodec } from '../worker/worker-gateway-charged-codec';
import { workerTurnEndedCodec } from '../worker/worker-turn-ended-codec';

// The profile a task runs on gives the prices, and a task with no profile of its own runs on the
// task role's.
export type ReadRunPrices = (profile: string | null) => ModelPrices | null;

// A task run whose start record names a meter counts the reads of its sandboxes and the dollars of
// its worker runs. An earlier task run keeps pricing its records, a tally beside a turn record
// counting only what exceeds it, and another task run's spend never counts.
export function buildDollarsMeter(readPrices: ReadRunPrices): RunMeter {
  return {
    name: 'dollars',
    read: async (context, run) => {
      if (run.opened.meter !== undefined) {
        return readMeteredDollars(context, run);
      }

      const setup = await readTaskSetup(context, run.taskID);

      const options = setup?.kind === 'started' ? setup.options : null;
      const prices = readPrices(options?.profile ?? null);

      const records = await readRunRecords(context, run, [
        modelTurnEndedCodec.kind,
        modelSessionSummarizedCodec.kind,
        taskFailedTurnSpentCodec.kind,
        workerTurnEndedCodec.kind,
        workerGatewayChargedCodec.kind,
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

async function readMeteredDollars(
  context: Pick<TasksContext, 'log' | 'runners'>,
  run: TaskRun,
): Promise<number> {
  const reads = await readMeterReads(context, run);

  const workers = await readRunRecords(context, run, [
    workerTurnEndedCodec.kind,
    workerGatewayChargedCodec.kind,
  ]);

  let workerDollars = 0;

  for (const record of workers) {
    workerDollars += buildRecordDollars(record, null);
  }

  return pickTaskRunMicros(reads, workerDollars) / 1_000_000;
}

// A turn and a summary hold the dollars of their tokens at the prices when they were written, so a
// changed price table never reprices them. A record with none prices through the table now, and a
// token count it lacks prices as nothing.
function buildRecordDollars(record: LogRecord, prices: ModelPrices | null): number {
  if (record.kind === modelTurnEndedCodec.kind) {
    const ended = modelTurnEndedCodec.tryDecodePartial(record.payload) ?? {};

    return ended.dollars ?? buildPricedCost(ended, prices);
  }

  if (record.kind === taskFailedTurnSpentCodec.kind) {
    return taskFailedTurnSpentCodec.decode(record.payload).dollars;
  }

  if (record.kind === workerTurnEndedCodec.kind) {
    return workerTurnEndedCodec.decode(record.payload).dollars;
  }

  if (record.kind === workerGatewayChargedCodec.kind) {
    return workerGatewayChargedCodec.decode(record.payload).dollars;
  }

  const summarized = modelSessionSummarizedCodec.tryDecodePartial(record.payload);

  return summarized?.dollars ?? buildPricedCost(summarized?.usage ?? {}, prices);
}

function buildPricedCost(tokens: TokenCounts, prices: ModelPrices | null): number {
  return prices === null ? 0 : buildTokensCost(tokens, prices);
}

function isTallyBesideTurn(record: LogRecord): boolean {
  return (
    record.kind === taskFailedTurnSpentCodec.kind &&
    taskFailedTurnSpentCodec.decode(record.payload).besideTurnRecord === true
  );
}
