import { appendFile } from 'node:fs/promises';
// @boundaries-ignore a spike imports the code it measures
import type { CheckReply, CheckRequest } from '../../../libs/wire/src/check-frame.ts';
// @boundaries-ignore a spike imports the code it measures
import { parseCheckerAnswer } from '../../../modules/sessions/src/parse-checker-answer.ts';
import { renderCheckerInput } from './render-checker-input.ts';
import type { CheckRecord, ConsentCase } from './types.ts';

export interface CheckRun {
  cases: readonly ConsentCase[];
  done: readonly CheckRecord[];
  outPath: string;
  profile: CheckRequest['profile'];
  systemPrompt: string;
  promptSHA256: string;
  budgetUSD: number;
  concurrency: number;
  runCheck: (request: CheckRequest) => Promise<CheckReply>;
}

export interface CheckRunResult {
  ran: number;
  skipped: number;
  costUSD: number;
  isStoppedAtBudget: boolean;
}

// Runs the checker on each case the output file lacks, appending one record per call. A rerun skips
// the cases the file holds, and refuses a file whose records hold another model, effort or prompt.
// No call starts once the spend reaches the budget, so the spend passes it by at most the calls in
// flight.
export async function runChecks(run: CheckRun): Promise<CheckRunResult> {
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

  const doneIDs = new Set(run.done.map((record) => record.caseID));
  const queue = run.cases.filter((consentCase) => !doneIDs.has(consentCase.caseID));
  const result: CheckRunResult = {
    ran: 0,
    skipped: run.cases.length - queue.length,
    costUSD: run.done.reduce((sum, record) => sum + record.costUSD, 0),
    isStoppedAtBudget: false,
  };

  const workers = Array.from({ length: run.concurrency }, async () => {
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
      if (result.costUSD >= run.budgetUSD) {
        result.isStoppedAtBudget = true;

        return;
      }

      const record = await runOneCheck(run, next);

      result.costUSD += record.costUSD;
      result.ran += 1;
      await appendFile(run.outPath, `${JSON.stringify(record)}\n`, { mode: 0o600 });
    }
  });

  await Promise.all(workers);

  return result;
}

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

  if (reply.kind === 'failed') {
    return { ...base, verdict: 'unsure', reason: '', failure: reply.reason, costUSD: 0 };
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
