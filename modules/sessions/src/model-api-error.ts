import type { RecordInput } from '@heynixie/log';
import { StepFailedError } from '@heynixie/tasks';
import type { ModelAPIErrorKind } from '@heynixie/wire';
import { match } from 'ts-pattern';
import { modelAPIReasonPrefix } from './model-api-reason-prefix';

export class ModelAPIError extends StepFailedError {
  readonly kind: ModelAPIErrorKind;

  // The CLI's own text for the refused call, which never quotes the conversation, so a log may hold
  // it.
  readonly detail: string;

  constructor(kind: ModelAPIErrorKind, detail: string, replies: readonly RecordInput[]) {
    super(`the conversation turn failed: the model API refused the call with ${kind}: ${detail}`, {
      reason: `${modelAPIReasonPrefix}${kind}`,
      isWaitingForOwner: isWaitingForOwner(kind),
      records: replies,
    });

    this.name = 'ModelAPIError';
    this.kind = kind;
    this.detail = detail;
  }
}

// A retry of a quota, a billing or an account refusal, or a model the API lacks, fails the same way
// until the owner changes something outside nixie.
function isWaitingForOwner(kind: ModelAPIErrorKind): boolean {
  return match(kind)
    .with('quota', 'billing', 'account', 'model_not_found', () => true)
    .with('rate_limit', 'overloaded', 'server_error', 'unknown', () => false)
    .exhaustive();
}
