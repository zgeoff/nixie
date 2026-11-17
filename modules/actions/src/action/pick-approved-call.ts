import type { ActionStatus, ApprovedCall, OutcomeReason } from '../types';
import { describeOutcomeReason } from './describe-outcome-reason';

export interface ApprovedCallFacts {
  readonly status: ActionStatus;
  readonly reason: OutcomeReason | null;

  // a stop cancelled the action before an attempt started
  readonly isCancelled: boolean;

  // the erasable message of the outcome record, null when it is gone or was never written
  readonly outcomeMessage: string | null;

  // the error text of the result record the outcome names, null when it is gone or absent
  readonly resultMessage: string | null;
}

const reasonLimit = 300;

export function pickApprovedCall(facts: ApprovedCallFacts): ApprovedCall {
  if (facts.status === 'done') {
    return { state: 'applied', reason: null };
  }

  if (facts.status === 'unknown') {
    return { state: 'unknown', reason: null };
  }

  if (facts.status === 'pending') {
    return facts.isCancelled
      ? { state: 'failed', reason: 'the task was stopped before it ran' }
      : { state: 'waiting', reason: null };
  }

  const reason =
    nonEmpty(facts.outcomeMessage) ??
    nonEmpty(facts.resultMessage) ??
    (facts.reason === null ? 'the call failed' : describeOutcomeReason(facts.reason));

  return { state: 'failed', reason: reason.slice(0, reasonLimit) };
}

function nonEmpty(text: string | null): string | null {
  return text === null || text.trim() === '' ? null : text;
}
