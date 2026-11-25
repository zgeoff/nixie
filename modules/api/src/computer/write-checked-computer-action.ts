import type { JSONObject } from '@heynixie/log';
import { withWriteTransaction } from '@heynixie/log';
import type { APIContext, Identity } from '../types';
import { buildInputHash } from '../utils/build-input-hash';
import { probeLiveIdentity } from '../utils/probe-live-identity';
import { readClientAction } from '../utils/read-client-action';
import { writeClientAction } from '../utils/write-client-action';

export interface CheckedComputerAction {
  readonly procedure: string;
  readonly clientActionID: string;

  // what the action acts on besides its action ID
  readonly input: JSONObject;

  // what the stored action says before the action ran
  readonly result: JSONObject;
}

// `earlier` is the result that an earlier try of an allowed action stored, or null
export type CheckedComputerActionResult =
  | { readonly status: 'allowed'; readonly earlier: Readonly<Record<string, unknown>> | null }
  | { readonly status: 'reused' }
  | { readonly status: 'unauthorized' };

// Checks that the session is live and that the action ID is its own, and stores the action. A retry
// of the same action finds the result its earlier try stored.
export function writeCheckedComputerAction(
  context: APIContext,
  caller: Identity,
  action: CheckedComputerAction,
): Promise<CheckedComputerActionResult> {
  const inputHash = buildInputHash(action.input);

  return withWriteTransaction(context.log.writer, async (tx) => {
    const [live, earlier] = await Promise.all([
      probeLiveIdentity(tx, context, caller.identityID),
      readClientAction(tx, action.clientActionID),
    ]);

    if (!live) {
      return { status: 'unauthorized' as const };
    }

    if (earlier !== null) {
      const isSameAction =
        earlier.procedure === action.procedure &&
        earlier.identityID === caller.identityID &&
        earlier.inputHash === inputHash;

      return isSameAction
        ? { status: 'allowed' as const, earlier: earlier.result }
        : { status: 'reused' as const };
    }

    await writeClientAction(tx, {
      clientActionID: action.clientActionID,
      procedure: action.procedure,
      identityID: caller.identityID,
      inputHash,
      result: action.result,
      recordedAt: context.clock.now(),
    });

    return { status: 'allowed' as const, earlier: null };
  });
}

// Stores what the action returned, so a retry of it gets the same answer.
export function writeComputerActionResult(
  context: APIContext,
  caller: Identity,
  action: CheckedComputerAction,
): Promise<void> {
  const inputHash = buildInputHash(action.input);

  return withWriteTransaction(context.log.writer, async (tx) => {
    await writeClientAction(tx, {
      clientActionID: action.clientActionID,
      procedure: action.procedure,
      identityID: caller.identityID,
      inputHash,
      result: action.result,
      recordedAt: context.clock.now(),
    });
  });
}
