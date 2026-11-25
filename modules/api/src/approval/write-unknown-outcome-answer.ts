import { readUnknownWaiting, writeUnknownAnswer } from '@heynixie/actions';
import type { UnknownChoice } from '@heynixie/actions';
import { withWriteTransaction } from '@heynixie/log';
import type { PasskeyRefusal } from '@heynixie/proposals';
import { z } from 'zod';
import type { Assertion } from '../passkey/challenge-for';
import type { APIContext, Identity } from '../types';
import { buildInputHash } from '../utils/build-input-hash';
import { probeLiveIdentity } from '../utils/probe-live-identity';
import { readClientAction } from '../utils/read-client-action';
import { writeClientAction } from '../utils/write-client-action';
import { checkRetryPasskey } from './check-retry-passkey';

export interface UnknownOutcomeAnswer {
  readonly actionID: string;
  readonly choice: UnknownChoice;
  readonly clientActionID: string;
  readonly passkey?: Assertion | undefined;
}

export type UnknownOutcomeAnswerResult =
  | { readonly status: 'answered'; readonly actionID: string; readonly choice: UnknownChoice }
  | { readonly status: 'unauthorized' }
  | { readonly status: 'reused' }
  | { readonly status: 'not_allowed'; readonly reason: string }
  | { readonly status: 'passkey_refused'; readonly refusal: PasskeyRefusal };

const procedure = 'approvals.answerUnknownOutcome';

const storedSchema = z.object({
  actionID: z.string(),
  choice: z.enum(['happened', 'retry', 'drop']),
});

// A checked action: the answer is stored under the client action ID, so a retry of the call gets
// the same result. A passkey refusal stores nothing, so a retry with a fresh assertion runs every
// check again.
export function writeUnknownOutcomeAnswer(
  context: APIContext,
  caller: Identity,
  answer: UnknownOutcomeAnswer,
): Promise<UnknownOutcomeAnswerResult> {
  return withWriteTransaction(
    context.log.writer,
    async (tx): Promise<UnknownOutcomeAnswerResult> => {
      if (!(await probeLiveIdentity(tx, context, caller.identityID))) {
        return { status: 'unauthorized' };
      }

      const inputHash = buildInputHash({ actionID: answer.actionID, choice: answer.choice });

      const earlier = await readClientAction(tx, answer.clientActionID);

      if (earlier !== null) {
        const isSame =
          earlier.procedure === procedure &&
          earlier.identityID === caller.identityID &&
          earlier.inputHash === inputHash;

        return isSame
          ? { status: 'answered', ...storedSchema.parse(earlier.result) }
          : { status: 'reused' };
      }

      const riskClass = await readUnknownWaiting(tx, answer.actionID);

      if (riskClass === null) {
        return { status: 'not_allowed', reason: 'not_waiting' };
      }

      const refusal = await checkRetryPasskey(context, tx, { caller, answer, riskClass });

      if (refusal !== null) {
        return { status: 'passkey_refused', refusal };
      }

      await writeUnknownAnswer(tx, context, {
        actionID: answer.actionID,
        choice: answer.choice,
        identityID: caller.identityID,
      });

      const result = { actionID: answer.actionID, choice: answer.choice };

      await writeClientAction(tx, {
        clientActionID: answer.clientActionID,
        procedure,
        identityID: caller.identityID,
        inputHash,
        result,
        recordedAt: context.clock.now(),
      });

      return { status: 'answered', ...result };
    },
  );
}
