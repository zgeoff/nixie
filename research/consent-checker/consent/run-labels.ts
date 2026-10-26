// @boundaries-ignore a spike imports the code it measures
import type { CheckReply, CheckRequest } from '../../../libs/wire/src/check-frame.ts';
import { buildLabelRecord } from './build-label-record.ts';
import { renderLabellerInput } from './render-labeller-input.ts';
import type { QueueResult } from './run-budgeted-queue.ts';
import { runBudgetedQueue } from './run-budgeted-queue.ts';
import type { LabelRecord, LabelTurn } from './types.ts';
import { noOutputFailure } from './types.ts';

export interface LabelRun {
  turns: readonly LabelTurn[];
  done: readonly LabelRecord[];
  appendRecord: (record: LabelRecord) => Promise<void>;
  profile: CheckRequest['profile'];
  systemPrompt: string;
  promptSHA256: string;
  otherSpentUSD: number;
  budgetUSD: number;
  limit: number | null;
  concurrency: number;
  runLabel: (request: CheckRequest) => Promise<CheckReply>;
}

export interface LabelRunResult extends QueueResult {
  skipped: number;
}

// Runs the labeller on each turn the done records lack, appending one record per turn. A rerun skips
// the turns the done records hold an answer for, and refuses done records of another model, effort
// or prompt. One budget covers the done records' spend and the spend of the spike's other calls.
export async function runLabels(run: LabelRun): Promise<LabelRunResult> {
  const mismatch = run.done.find(
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

  const doneSteps = new Set(
    run.done
      .filter((record) => record.failure !== noOutputFailure)
      .map((record) => record.stepSequence),
  );

  const items = run.turns.filter((turn) => !doneSteps.has(turn.stepSequence));

  const result = await runBudgetedQueue({
    items,
    appendOutput: run.appendRecord,
    spentUSD: run.otherSpentUSD + run.done.reduce((sum, record) => sum + record.costUSD, 0),
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
