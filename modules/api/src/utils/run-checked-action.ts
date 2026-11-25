import type { JSONObject } from '@heynixie/log';
import { withWriteTransaction } from '@heynixie/log';
import type { APIContext, Identity } from '../types';
import { buildInputHash } from './build-input-hash';
import { probeLiveIdentity } from './probe-live-identity';
import { readClientAction } from './read-client-action';
import { writeClientAction } from './write-client-action';

export interface CheckedAction {
  readonly procedure: string;
  readonly clientActionID: string;
  readonly input: JSONObject;

  // the input fields that the stored hash leaves out, such as a secret
  readonly omit?: readonly string[];
}

// `isReplay` is true when an earlier try of the action stored the result
export type CheckedActionRun =
  | {
      readonly status: 'done';
      readonly result: Readonly<Record<string, unknown>>;
      readonly isReplay: boolean;
    }
  | { readonly status: 'reused' }
  | { readonly status: 'unauthorized' };

// the last try of each action ID that has not finished, so a second try waits for the first
const tries = new Map<string, Promise<void>>();

// Runs a checked action once for its action ID, and stores what it returned, a refusal too, so a
// retry gets the same answer whatever the state is by then. Two tries of one ID that overlap run one
// after the other, and the second reads the first's result.
export async function runCheckedAction(
  context: APIContext,
  caller: Identity,
  action: CheckedAction,
  run: () => Promise<JSONObject>,
): Promise<CheckedActionRun> {
  const earlier = tries.get(action.clientActionID) ?? Promise.resolve();
  const turn = Promise.withResolvers<void>();

  tries.set(action.clientActionID, turn.promise);

  try {
    await earlier;

    return await tryAction(context, caller, action, run);
  } finally {
    turn.resolve();

    if (tries.get(action.clientActionID) === turn.promise) {
      tries.delete(action.clientActionID);
    }
  }
}

async function tryAction(
  context: APIContext,
  caller: Identity,
  action: CheckedAction,
  run: () => Promise<JSONObject>,
): Promise<CheckedActionRun> {
  const inputHash = buildInputHash(action.input, action.omit);

  const checked = await withWriteTransaction(context.log.writer, async (tx) => {
    const [live, stored] = await Promise.all([
      probeLiveIdentity(tx, context, caller.identityID),
      readClientAction(tx, action.clientActionID),
    ]);

    if (!live) {
      return { status: 'unauthorized' } as const;
    }

    if (stored !== null) {
      const isSame =
        stored.procedure === action.procedure &&
        stored.identityID === caller.identityID &&
        stored.inputHash === inputHash;

      return isSame
        ? ({ status: 'stored', result: stored.result } as const)
        : ({ status: 'reused' } as const);
    }

    await writeClientAction(tx, {
      clientActionID: action.clientActionID,
      procedure: action.procedure,
      identityID: caller.identityID,
      inputHash,
      result: {},
      recordedAt: context.clock.now(),
    });

    return { status: 'new' } as const;
  });

  if (checked.status === 'unauthorized' || checked.status === 'reused') {
    return { status: checked.status };
  }

  // a stored action with no result is one that never finished
  if (checked.status === 'stored' && Object.keys(checked.result).length > 0) {
    return { status: 'done', result: checked.result, isReplay: true };
  }

  const result = await run();

  await withWriteTransaction(context.log.writer, (tx) =>
    writeClientAction(tx, {
      clientActionID: action.clientActionID,
      procedure: action.procedure,
      identityID: caller.identityID,
      inputHash,
      result,
      recordedAt: context.clock.now(),
    }),
  );

  return { status: 'done', result, isReplay: false };
}
