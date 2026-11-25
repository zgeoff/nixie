import type { EnvelopeRecord } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { z } from 'zod';
import type { BudgetsTables } from '../types';
import { splitLedgerKey } from './split-ledger-key';
import { toMicrosUp } from './to-micros-up';

export const taskRunEndedKind = 'task.run_ended';
export const workerRunEndedKind = 'worker.run_ended';

// Only the fields the ledger reads. The kinds belong to the tasks and sessions modules, which depend
// on this one, so the ledger parses their payloads for itself.
const taskRunEndedSchema = z.object({
  runID: z.string(),
  used: z.object({ dollars: z.number() }),
});

const workerRunEndedSchema = z.object({
  workerRunID: z.string(),
  used: z.object({ dollars: z.number(), tokens: z.number() }),
});

// A task run's or a worker run's row holds what the run spent: a run ends once, so its record sets
// the row and never adds to it. Returns the keys that it set.
export async function foldRunSpend(
  tx: Transaction<unknown>,
  record: EnvelopeRecord,
): Promise<readonly string[]> {
  // the registry here lacks these kinds, so the comparison reads the kind as plain text
  const kind: string = record.kind;

  if (kind === taskRunEndedKind) {
    const ended = taskRunEndedSchema.parse(record.payload);

    return [
      await setRow(tx, `task_run:${ended.runID}`, 'micros:USD', toMicrosUp(ended.used.dollars)),
    ];
  }

  if (kind === workerRunEndedKind) {
    const ended = workerRunEndedSchema.parse(record.payload);
    const counter = `worker_run:${ended.workerRunID}`;

    return [
      await setRow(tx, counter, 'micros:USD', toMicrosUp(ended.used.dollars)),
      await setRow(tx, counter, 'tokens', ended.used.tokens),
    ];
  }

  return [];
}

async function setRow(
  tx: Transaction<unknown>,
  counter: string,
  unit: string,
  amount: number,
): Promise<string> {
  const ledgerKey = [counter, unit, 'none', ''].join('|');
  const parts = splitLedgerKey(ledgerKey);

  await tx
    .$extendTables<BudgetsTables>()
    .insertInto('spend_ledger')
    .values({
      ledger_key: ledgerKey,
      counter: parts.counter,
      unit: parts.unit,
      period_kind: parts.kind,
      period_start: parts.start,
      amount,
    })
    .onConflict((conflict) => conflict.column('ledger_key').doUpdateSet({ amount }))
    .execute();

  return ledgerKey;
}
