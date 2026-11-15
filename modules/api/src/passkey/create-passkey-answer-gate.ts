import type { PasskeyGate } from '@heynixie/proposals';
import type { APIContext, Identity } from '../types';
import type { Assertion } from './challenge-for';
import { createPasskeyCheck } from './create-passkey-check';
import { readLivePasskeys } from './read-live-passkeys';

interface AnswerGateRequest {
  readonly caller: Identity;
  readonly assertion: Assertion | undefined;
}

// The gate of a device answer. A refusal names what is missing: no live passkey, no assertion, or an
// assertion that failed.
export function createPasskeyAnswerGate(
  context: APIContext,
  request: AnswerGateRequest,
): PasskeyGate {
  const check = createPasskeyCheck(context);

  return {
    kind: 'device',
    check: async (tx, _row, answer) => {
      const live = await readLivePasskeys(tx);

      if (live.length === 0) {
        return { error: 'NO_PASSKEY' };
      }

      if (request.assertion === undefined) {
        return { error: 'PASSKEY_REQUIRED' };
      }

      const verdict = await check.verify(
        tx,
        request.caller,
        {
          kind: 'answer',
          proposalID: answer.proposalID,
          actionHash: answer.actionHash ?? '',
          choice: answer.choice,
          ...(answer.ruleHash === undefined ? {} : { ruleHash: answer.ruleHash }),
        },
        request.assertion,
      );

      return 'error' in verdict ? verdict : null;
    },
  };
}
