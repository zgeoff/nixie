import { withWriteTransaction } from '@heynixie/log';
import type { JSONObject } from '@heynixie/log';
import type { Transaction } from 'kysely';
import type { APIContext, Identity } from '../types';
import { probeLiveIdentity } from '../utils/probe-live-identity';
import { readClientAction } from '../utils/read-client-action';
import { writeClientAction } from '../utils/write-client-action';

export interface CheckedRuleAction<Refusal> {
  readonly clientActionID: string;
  readonly procedure: string;
  readonly inputHash: string;

  // Writes the action. A refusal is stored nowhere, so a retry runs the write again.
  readonly write: (
    tx: Transaction<unknown>,
  ) => Promise<
    | { readonly status: 'done'; readonly result: JSONObject }
    | { readonly status: 'refused'; readonly refusal: Refusal }
  >;
}

export type CheckedRuleRun<Refusal> =
  | {
      readonly status: 'done';
      readonly result: Readonly<Record<string, unknown>>;
      readonly isReplay: boolean;
    }
  | { readonly status: 'unauthorized' }
  | { readonly status: 'reused' }
  | { readonly status: 'refused'; readonly refusal: Refusal };

// A client action of the rule store: it checks the caller, replays an earlier answer under the same
// client action ID, and stores the result of a new one in the transaction that wrote it.
export function runCheckedRuleAction<Refusal>(
  context: APIContext,
  caller: Identity,
  action: CheckedRuleAction<Refusal>,
): Promise<CheckedRuleRun<Refusal>> {
  return withWriteTransaction(context.log.writer, async (tx): Promise<CheckedRuleRun<Refusal>> => {
    if (!(await probeLiveIdentity(tx, context, caller.identityID))) {
      return { status: 'unauthorized' };
    }

    const earlier = await readClientAction(tx, action.clientActionID);

    if (earlier !== null) {
      const isSame =
        earlier.procedure === action.procedure &&
        earlier.identityID === caller.identityID &&
        earlier.inputHash === action.inputHash;

      return isSame
        ? { status: 'done', result: earlier.result, isReplay: true }
        : { status: 'reused' };
    }

    const written = await action.write(tx);

    if (written.status === 'refused') {
      return written;
    }

    await writeClientAction(tx, {
      clientActionID: action.clientActionID,
      procedure: action.procedure,
      identityID: caller.identityID,
      inputHash: action.inputHash,
      result: written.result,
      recordedAt: context.clock.now(),
    });

    return { status: 'done', result: written.result, isReplay: false };
  });
}
