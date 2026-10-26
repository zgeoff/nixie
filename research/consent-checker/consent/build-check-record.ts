// oxlint-disable @stylistic/lines-around-comment -- turbo reads @boundaries-ignore only on the line above an import, and the import sort keeps no blank line there
// @boundaries-ignore a spike imports the code it measures
import { parseCheckerAnswer } from '../../../modules/sessions/src/parse-checker-answer.ts';
import { buildCheckFingerprint } from './build-check-fingerprint.ts';
import type { PaidReply } from './run-paid-query.ts';
import type { CheckRecord, ConsentCase, RecordSource } from './types.ts';
import { emptyAnswerReason, noOutputFailure } from './types.ts';

// A failed query or an answer with no output, such as a call the model API refused, measures the API
// and not the checker, so its record holds only its cost and the reason the query gave.
export function buildCheckRecord(
  consentCase: ConsentCase,
  reply: PaidReply,
  source: RecordSource,
): CheckRecord {
  const base = {
    caseID: consentCase.caseID,
    bucket: consentCase.bucket,
    tool: consentCase.call.tool,
    model: source.model,
    effort: source.effort,
    promptSHA256: source.promptSHA256,
    inputSHA256: buildCheckFingerprint(consentCase),
  };

  if (reply.kind === 'failed' || reply.output === undefined) {
    return {
      ...base,
      verdict: 'unsure',
      reason: '',
      failure: noOutputFailure,
      failureReason: reply.kind === 'failed' ? reply.reason : emptyAnswerReason,
      costUSD: reply.costUSD,
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
