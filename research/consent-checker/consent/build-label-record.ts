// @boundaries-ignore a spike imports the code it measures
import type { CheckReply } from '../../../libs/wire/src/check-frame.ts';
import { emptyAnswerReason, noOutputFailure } from './run-budgeted-queue.ts';
import type { LabelRecord, LabelTurn, RecordSource } from './types.ts';
import { labellerOutputSchema } from './types.ts';

// A failed query or an answer with no output, such as a call the model API refused, gives a record
// that holds its cost, the reason the query gave and no label, so a rerun labels the turn again.
export function buildLabelRecord(turn: LabelTurn, reply: CheckReply, source: RecordSource): LabelRecord {
  const base = {
    stepSequence: turn.stepSequence,
    model: source.model,
    effort: source.effort,
    promptSHA256: source.promptSHA256,
  };

  if (reply.kind === 'failed' || reply.output === undefined) {
    return {
      ...base,
      labels: [],
      failure: noOutputFailure,
      failureReason: reply.kind === 'failed' ? reply.reason : emptyAnswerReason,
      costUSD: reply.kind === 'failed' ? 0 : reply.costUSD,
    };
  }

  const parsed = labellerOutputSchema.safeParse(reply.output);

  if (!parsed.success) {
    return {
      ...base,
      labels: turn.calls.map((call) => ({ caseID: call.caseID, label: 'unsure', reason: 'the answer was unreadable' })),
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
