import type { ActionRiskClass } from '@heynixie/actions';
import type { PasskeyRefusal } from '@heynixie/proposals';
import type { Transaction } from 'kysely';
import { checkPasskey } from '../passkey/check-passkey';
import type { APIContext, Identity } from '../types';
import type { UnknownOutcomeAnswer } from './write-unknown-outcome-answer';

interface PasskeyRequest {
  readonly caller: Identity;
  readonly answer: UnknownOutcomeAnswer;
  readonly riskClass: ActionRiskClass;
}

// A retry of an action that ran under an always-ask approval takes a passkey, because it sends again.
export async function checkRetryPasskey(
  context: APIContext,
  tx: Transaction<unknown>,
  request: PasskeyRequest,
): Promise<PasskeyRefusal | null> {
  const isGated = request.answer.choice === 'retry' && request.riskClass !== 'routine';

  if (!isGated) {
    return null;
  }

  const outcome = await checkPasskey(context, tx, {
    caller: request.caller,
    assertion: request.answer.passkey,
    binding: { kind: 'unknown_outcome', actionID: request.answer.actionID, choice: 'retry' },
  });

  return 'error' in outcome ? outcome : null;
}
