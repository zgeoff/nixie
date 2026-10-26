// @boundaries-ignore a spike imports the code it measures
import type { CheckReply, CheckRequest } from '../../../libs/wire/src/check-frame.ts';
import { renderLabellerInput } from './render-labeller-input.ts';
import type { QueueResult } from './run-budgeted-queue.ts';
import { noOutputFailure, runBudgetedQueue } from './run-budgeted-queue.ts';
import type { LabelRecord, LabelTurn } from './types.ts';
import { labellerOutputSchema } from './types.ts';

export interface LabelRun {
  turns: readonly LabelTurn[];
  done: readonly LabelRecord[];
  outPath: string;
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

// Runs the labeller on each turn the output file lacks, appending one record per turn. A rerun
// skips the turns the file holds an answer for, and refuses a file whose records hold another model, effort or
// prompt. One budget covers the file's own spend and the spend of the spike's other calls.
export async function runLabels(run: LabelRun): Promise<LabelRunResult> {
  const mismatch = run.done.find(
    (record) =>
      record.model !== run.profile.model ||
      record.effort !== run.profile.effort ||
      record.promptSHA256 !== run.promptSHA256,
  );

  if (mismatch !== undefined) {
    throw new Error(
      `${run.outPath} holds a run of ${mismatch.model} at ${mismatch.effort} effort with prompt ${mismatch.promptSHA256}`,
    );
  }

  const doneSteps = new Set(
    run.done.filter((record) => record.failure !== noOutputFailure).map((record) => record.stepSequence),
  );
  const items = run.turns.filter((turn) => !doneSteps.has(turn.stepSequence));
  const result = await runBudgetedQueue({
    items,
    outPath: run.outPath,
    spentUSD: run.otherSpentUSD + run.done.reduce((sum, record) => sum + record.costUSD, 0),
    budgetUSD: run.budgetUSD,
    limit: run.limit,
    concurrency: run.concurrency,
    runItem: (turn) => runOneLabel(run, turn),
  });

  return { ...result, skipped: run.turns.length - items.length };
}

// A failed query or an answer with no output, such as a call the model API refused, gives a record
// that holds its cost and no label, so a rerun labels the turn again.
async function runOneLabel(run: LabelRun, turn: LabelTurn): Promise<LabelRecord> {
  const reply = await run.runLabel({
    profile: run.profile,
    systemPrompt: run.systemPrompt,
    input: renderLabellerInput(turn),
  });
  const base = {
    stepSequence: turn.stepSequence,
    model: run.profile.model,
    effort: run.profile.effort,
    promptSHA256: run.promptSHA256,
  };

  if (reply.kind === 'failed' || reply.output === undefined) {
    return {
      ...base,
      labels: [],
      failure: noOutputFailure,
      costUSD: reply.kind === 'failed' ? 0 : reply.costUSD,
    };
  }

  const parsed = labellerOutputSchema.safeParse(reply.output);

  if (!parsed.success) {
    return {
      ...base,
      labels: buildUnsureLabels(turn, 'the answer was unreadable'),
      failure: 'unreadable',
      costUSD: reply.costUSD,
    };
  }

  const byNumber = new Map(parsed.data.calls.map((answer) => [answer.call, answer]));

  return {
    ...base,
    labels: turn.calls.map((call, index) => {
      const answer = byNumber.get(index + 1);

      return answer === undefined
        ? { caseID: call.caseID, label: 'unsure', reason: 'the answer left this call out' }
        : { caseID: call.caseID, label: answer.label, reason: answer.reason };
    }),
    failure: null,
    costUSD: reply.costUSD,
  };
}

function buildUnsureLabels(turn: LabelTurn, reason: string): LabelRecord['labels'] {
  return turn.calls.map((call) => ({ caseID: call.caseID, label: 'unsure', reason }));
}
