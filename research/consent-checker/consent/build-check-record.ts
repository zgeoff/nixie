// @boundaries-ignore a spike imports the code it measures
import type { CheckReply } from '../../../libs/wire/src/check-frame.ts';
// @boundaries-ignore a spike imports the code it measures
import { parseCheckerAnswer } from '../../../modules/sessions/src/parse-checker-answer.ts';
import { emptyAnswerReason, noOutputFailure } from './run-budgeted-queue.ts';
import type { CheckRecord, ConsentCase, RecordSource } from './types.ts';

// A failed query or an answer with no output, such as a call the model API refused, measures the API
// and not the checker, so its record holds only its cost and the reason the query gave.
export function buildCheckRecord(consentCase: ConsentCase, reply: CheckReply, source: RecordSource): CheckRecord {
  const base = {
    caseID: consentCase.caseID,
    bucket: consentCase.bucket,
    tool: consentCase.call.tool,
    model: source.model,
    effort: source.effort,
    promptSHA256: source.promptSHA256,
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

  const answer = parseCheckerAnswer(reply.output, source.model);

  return {
    ...base,
    verdict: answer.verdict,
    reason: answer.reason,
    failure: answer.failure,
    costUSD: reply.costUSD,
  };
}
