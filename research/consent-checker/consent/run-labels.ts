// @boundaries-ignore a spike imports the code it measures
import type { CheckRequest } from '../../../libs/wire/src/check-frame.ts';
import { buildLabelFingerprint } from './build-label-fingerprint.ts';
import { buildLabelRecord } from './build-label-record.ts';
import { buildLedger } from './build-ledger.ts';
import { ledgerKeys } from './ledger-keys.ts';
import { renderLabellerInput } from './render-labeller-input.ts';
import type { QueueResult } from './run-budgeted-queue.ts';
import { runBudgetedQueue } from './run-budgeted-queue.ts';
import type { PaidReply } from './run-paid-query.ts';
import type { LabelLine, LabelRecord, LabelTurn, Reservation } from './types.ts';
import { noOutputFailure } from './types.ts';

export interface LabelRun {
  turns: readonly LabelTurn[];
  done: readonly LabelLine[];
  appendReservation: (reservation: Reservation) => Promise<void>;
  appendRecord: (record: LabelRecord) => Promise<void>;
  reserveUSD: number;
  profile: CheckRequest['profile'];
  systemPrompt: string;
  promptSHA256: string;
  otherSpentUSD: number;
  budgetUSD: number;
  limit: number | null;
  concurrency: number;
  runLabel: (request: CheckRequest) => Promise<PaidReply>;
}

export interface LabelRunResult extends QueueResult {
  skipped: number;
}

// A rerun skips the turns the done records hold an answer of the turn's current input for, and
// refuses done records of another model, effort or prompt. One budget covers the done lines' spend
// and the other calls' spend.
export async function runLabels(run: LabelRun): Promise<LabelRunResult> {
  const ledger = buildLedger(run.done, ledgerKeys.label);

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
      .map((record) => `${record.stepSequence} ${record.inputSHA256}`),
  );

  const items = run.turns.filter(
    (turn) => !doneKeys.has(`${turn.stepSequence} ${buildLabelFingerprint(turn)}`),
  );

  const result = await runBudgetedQueue({
    items,
    appendReservation: (turn) =>
      run.appendReservation({ reservedFor: ledgerKeys.label(turn), reserveUSD: run.reserveUSD }),
    appendOutput: run.appendRecord,
    reserveUSD: run.reserveUSD,
    spentUSD: run.otherSpentUSD + ledger.spentUSD,
    budgetUSD: run.budgetUSD,
    limit: run.limit,
    concurrency: run.concurrency,
    runItem: (turn) => runOneLabel(run, turn),
  });

  return { ...result, skipped: run.turns.length - items.length };
}

async function runOneLabel(run: LabelRun, turn: LabelTurn): Promise<LabelRecord> {
  const reply = await run.runLabel({
    profile: run.profile,
    systemPrompt: run.systemPrompt,
    input: renderLabellerInput(turn),
  });

  return buildLabelRecord(turn, reply, {
    model: run.profile.model,
    effort: run.profile.effort,
    promptSHA256: run.promptSHA256,
  });
}
