import type { PasskeyGate } from '@heynixie/proposals';
import type { APIContext, Identity } from '../types';
import type { Assertion } from './challenge-for';
import { checkPasskey } from './check-passkey';

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
  return {
    kind: 'device',
    check: async (tx, _row, answer) => {
      const outcome = await checkPasskey(context, tx, {
        caller: request.caller,
        assertion: request.assertion,
        binding: {
          kind: 'answer',
          proposalID: answer.proposalID,
          actionHash: answer.actionHash ?? '',
          choice: answer.choice,
          ...(answer.ruleHash === undefined ? {} : { ruleHash: answer.ruleHash }),
          ...(answer.trust === undefined ? {} : { trust: answer.trust }),
          ...(answer.placeHash === undefined ? {} : { placeHash: answer.placeHash }),
          ...(answer.tickedPlaces === undefined ? {} : { tickedPlaces: [...answer.tickedPlaces] }),
        },
      });

      return 'error' in outcome ? outcome : null;
    },
  };
}
