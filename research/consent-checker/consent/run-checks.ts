// @boundaries-ignore a spike imports the code it measures
import type { CheckRequest } from '../../../libs/wire/src/check-frame.ts';
import { buildCheckFingerprint } from './build-check-fingerprint.ts';
import { buildCheckRecord } from './build-check-record.ts';
import { buildLedger } from './build-ledger.ts';
import { buildQueryBoundUSD } from './build-query-bound.ts';
import { buildRunReserveUSD } from './build-run-reserve.ts';
import { ledgerKeys } from './ledger-keys.ts';
import { renderCheckerInput } from './render-checker-input.ts';
import type { QueueResult } from './run-budgeted-queue.ts';
import { runBudgetedQueue } from './run-budgeted-queue.ts';
import type { PaidReply } from './run-paid-query.ts';
import type { CheckLine, CheckRecord, ConsentCase, Reservation, Settlement } from './types.ts';
import { noOutputFailure } from './types.ts';

export interface CheckRun {
  cases: readonly ConsentCase[];
  done: readonly CheckLine[];
  appendReservation: (reservation: Reservation) => Promise<void>;
  appendSettlement: (settlement: Settlement) => Promise<void>;
  appendRecord: (record: CheckRecord) => Promise<void>;
  reserveUSD: number | null;
  profile: CheckRequest['profile'];
  systemPrompt: string;
  promptSHA256: string;
  otherSpentUSD: number;
  budgetUSD: number;
  limit: number | null;
  concurrency: number;
  runCheck: (request: CheckRequest) => Promise<PaidReply>;
}

export interface CheckRunResult extends QueueResult {
  skipped: number;
}

// A rerun first settles each reservation a crash left open, skips the cases the done records hold a
// verdict of the case's current input for, and refuses done records of another model, effort or
// prompt. One budget covers the done lines' spend and the other calls' spend.
export async function runChecks(run: CheckRun): Promise<CheckRunResult> {
  const ledger = buildLedger(run.done, ledgerKeys.check);

  const mismatch = ledger.records.find(
    (record) =>
      record.model !== run.profile.model ||
      record.effort !== run.profile.effort ||
      record.promptSHA256 !== run.promptSHA256,
  );

  if (mismatch !== undefined) {
    throw new Error(
      `the output file holds a run of ${mismatch.model} at ${mismatch.effort} effort with prompt ${mismatch.promptSHA256}`,
    );
  }

  const doneKeys = new Set(
    ledger.records
      .filter((record) => record.failure !== noOutputFailure)
      .map((record) => `${record.caseID} ${record.inputSHA256}`),
  );

  const items = run.cases.filter(
    (consentCase) => !doneKeys.has(`${consentCase.caseID} ${buildCheckFingerprint(consentCase)}`),
  );

  const reserveUSD = buildRunReserveUSD(
    run.reserveUSD,
    items.map((consentCase) =>
      buildQueryBoundUSD(
        run.profile.model,
        Buffer.byteLength(run.systemPrompt) + Buffer.byteLength(renderCheckerInput(consentCase)),
      ),
    ),
  );

  for (const reservation of ledger.open) {
    await run.appendSettlement({
      settledFor: reservation.reservedFor,
      settledUSD: reservation.reserveUSD,
    });
  }

  const result = await runBudgetedQueue({
    items,
    appendReservation: (consentCase) =>
      run.appendReservation({ reservedFor: ledgerKeys.check(consentCase), reserveUSD }),
    appendOutput: run.appendRecord,
    reserveUSD,
    spentUSD: run.otherSpentUSD + ledger.spentUSD,
    budgetUSD: run.budgetUSD,
    limit: run.limit,
    concurrency: run.concurrency,
    runItem: (consentCase) => runOneCheck(run, consentCase),
  });

  return { ...result, skipped: run.cases.length - items.length };
}

async function runOneCheck(run: CheckRun, consentCase: ConsentCase): Promise<CheckRecord> {
  const reply = await run.runCheck({
    profile: run.profile,
    systemPrompt: run.systemPrompt,
    input: renderCheckerInput(consentCase),
  });

  return buildCheckRecord(consentCase, reply, {
    model: run.profile.model,
    effort: run.profile.effort,
    promptSHA256: run.promptSHA256,
  });
}
