import type { EnvelopeRecord } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';
import type { BudgetsTables } from '../types';
import type { MeterRead } from './pick-task-run-micros';
import { pickTaskRunMicros } from './pick-task-run-micros';
import { splitLedgerKey } from './split-ledger-key';
import { toMicrosUp } from './to-micros-up';

const taskRunEndedKind = 'task.run_ended';
const taskMeterReadKind = 'task.meter_read';
const workerRunEndedKind = 'worker.run_ended';

// Only the fields the ledger reads. The kinds belong to the tasks and sessions modules, which depend
// on this one, so the ledger parses their payloads for itself.
const taskRunEndedSchema = z.object({
  runID: z.string(),
  used: z.object({ dollars: z.number() }),
});

const taskMeterReadSchema = z.object({ taskRunID: z.string() });

const workerRunEndedSchema = z.object({
  workerRunID: z.string(),
  used: z.object({ dollars: z.number(), tokens: z.number() }),
});

// A record sets a task run's or a worker run's row and never adds to it: a meter read sets the task
// run's, a worker run's end sets its own, and so does the end of a task run that began with no meter.
// Returns the keys that it set.
export async function foldRunSpend(
  tx: Transaction<unknown>,
  record: EnvelopeRecord,
): Promise<readonly string[]> {
  // the registry here lacks these kinds, so the comparison reads the kind as plain text
  const kind: string = record.kind;

  if (kind === taskMeterReadKind) {
    const read = taskMeterReadSchema.parse(record.payload);

    const micros = await readTaskRunMicros(tx, record, read.taskRunID);

    return [await setRow(tx, `task_run:${read.taskRunID}`, 'micros:USD', micros)];
  }

  if (kind === taskRunEndedKind) {
    const ended = taskRunEndedSchema.parse(record.payload);

    const isMetered = await probeRunBeganWithMeter(tx, record, ended.runID);

    if (isMetered) {
      return [];
    }

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

const meterReadRowSchema = z.object({
  sandbox: z.string(),
  reason: z.string(),
  countMicros: z.number(),
});

// The reads of the task run up to this record, and the dollars its worker runs charged up to it, so
// a rebuild that folds each record in order reproduces every row.
async function readTaskRunMicros(
  tx: Transaction<unknown>,
  record: EnvelopeRecord,
  taskRunID: string,
): Promise<number> {
  const reads = await sql`select
      json_extract(payload, '$.sandbox') as sandbox,
      json_extract(payload, '$.reason') as reason,
      json_extract(payload, '$.countMicros') as countMicros
    from records
    where thread = ${record.thread}
      and kind = ${taskMeterReadKind}
      and json_extract(payload, '$.taskRunID') = ${taskRunID}
      and sequence <= ${record.sequence}
    order by sequence`.execute(tx);

  const workers = await sql`select coalesce(sum(json_extract(payload, '$.dollars')), 0) as dollars
    from records
    where thread = ${record.thread}
      and kind in ('worker.turn_ended', 'worker.gateway_charged')
      and json_extract(payload, '$.taskRunID') = ${taskRunID}
      and sequence <= ${record.sequence}`.execute(tx);

  const parsed: readonly MeterRead[] = reads.rows.map((row) => meterReadRowSchema.parse(row));
  const dollars = z.object({ dollars: z.number() }).parse(workers.rows[0]).dollars;

  return pickTaskRunMicros(parsed, dollars);
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

async function probeRunBeganWithMeter(
  tx: Transaction<unknown>,
  record: EnvelopeRecord,
  runID: string,
): Promise<boolean> {
  const opened = await sql`select json_extract(payload, '$.meter') as meter
    from records
    where thread = ${record.thread}
      and kind = 'task.run_opened'
      and json_extract(payload, '$.runID') = ${runID}`.execute(tx);

  const row = z.object({ meter: z.string().nullable() }).safeParse(opened.rows[0]);

  return row.success && typeof row.data.meter === 'string';
}
