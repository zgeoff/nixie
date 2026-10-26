// @boundaries-ignore a spike imports the code it measures
import type { CheckReply, CheckRequest } from '../../../libs/wire/src/check-frame.ts';
// @boundaries-ignore a spike imports the code it measures
import { parseCheckerAnswer } from '../../../modules/sessions/src/parse-checker-answer.ts';
import { renderCheckerInput } from './render-checker-input.ts';
import type { QueueResult } from './run-budgeted-queue.ts';
import { emptyAnswerReason, noOutputFailure, runBudgetedQueue } from './run-budgeted-queue.ts';
import type { CheckRecord, ConsentCase } from './types.ts';

export interface CheckRun {
  cases: readonly ConsentCase[];
  done: readonly CheckRecord[];
  appendRecord: (record: CheckRecord) => Promise<void>;
  profile: CheckRequest['profile'];
  systemPrompt: string;
  promptSHA256: string;
  otherSpentUSD: number;
  budgetUSD: number;
  limit: number | null;
  concurrency: number;
  runCheck: (request: CheckRequest) => Promise<CheckReply>;
}

export interface CheckRunResult extends QueueResult {
  skipped: number;
}

// Runs the checker on each case the done records lack, appending one record per call. A rerun skips
// the cases the done records hold a verdict for, and refuses done records of another model, effort
// or prompt. One budget covers the done records' spend and the spend of the spike's other calls.
export async function runChecks(run: CheckRun): Promise<CheckRunResult> {
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

  const doneIDs = new Set(
    run.done.filter((record) => record.failure !== noOutputFailure).map((record) => record.caseID),
  );
  const items = run.cases.filter((consentCase) => !doneIDs.has(consentCase.caseID));
  const result = await runBudgetedQueue({
    items,
    appendOutput: run.appendRecord,
    spentUSD: run.otherSpentUSD + run.done.reduce((sum, record) => sum + record.costUSD, 0),
    budgetUSD: run.budgetUSD,
    limit: run.limit,
    concurrency: run.concurrency,
    runItem: (consentCase) => runOneCheck(run, consentCase),
  });

  return { ...result, skipped: run.cases.length - items.length };
}

// A failed query or an answer with no output, such as a call the model API refused, measures the API
// and not the checker, so its record holds only its cost and the reason the query gave.
async function runOneCheck(run: CheckRun, consentCase: ConsentCase): Promise<CheckRecord> {
  const reply = await run.runCheck({
    profile: run.profile,
    systemPrompt: run.systemPrompt,
    input: renderCheckerInput(consentCase),
  });
  const base = {
    caseID: consentCase.caseID,
    bucket: consentCase.bucket,
    tool: consentCase.call.tool,
    model: run.profile.model,
    effort: run.profile.effort,
    promptSHA256: run.promptSHA256,
  };

  if (reply.kind === 'failed' || reply.output === undefined) {
    return {
      ...base,
      verdict: 'unsure',
      reason: '',
      failure: noOutputFailure,
      failureReason: reply.kind === 'failed' ? reply.reason : emptyAnswerReason,
      costUSD: reply.kind === 'failed' ? 0 : reply.costUSD,
    };
  }

  const answer = parseCheckerAnswer(reply.output, run.profile.model);

  return {
    ...base,
    verdict: answer.verdict,
    reason: answer.reason,
    failure: answer.failure,
    costUSD: reply.costUSD,
  };
}
