import type { JSONObject, WriteTransaction } from '@heynixie/log';
import { withWriteTransaction } from '@heynixie/log';
import { z } from 'zod';
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

// What a run gets: whether an earlier try of this action began and never stored its result, and a
// way to store the result in the run's own write transaction, so the operation and its result commit
// together. A run that never calls `writeResult` has its result stored after it returns.
export interface CheckedAttempt {
  readonly isRetry: boolean;
  readonly writeResult: (tx: WriteTransaction, result: JSONObject) => Promise<void>;
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
  run: (attempt: CheckedAttempt) => Promise<JSONObject>,
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

// A stored action whose row holds no `result` began and never finished. A finished one holds its
// result under that key, so an empty result still counts as finished.
const unfinishedResult = { unfinished: true } as const;
const finishedSchema = z.object({ result: z.record(z.string(), z.unknown()) });

async function tryAction(
  context: APIContext,
  caller: Identity,
  action: CheckedAction,
  run: (attempt: CheckedAttempt) => Promise<JSONObject>,
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
      result: unfinishedResult,
      recordedAt: context.clock.now(),
    });

    return { status: 'new' } as const;
  });

  if (checked.status === 'unauthorized' || checked.status === 'reused') {
    return { status: checked.status };
  }

  if (checked.status === 'stored') {
    const finished = finishedSchema.safeParse(checked.result);

    if (finished.success) {
      return { status: 'done', result: finished.data.result, isReplay: true };
    }
  }

  const written = { isWritten: false };

  const result = await run({
    isRetry: checked.status === 'stored',
    writeResult: async (tx, value) => {
      written.isWritten = true;

      await writeClientAction(
        tx,
        buildStoredAction({ context, caller, action, inputHash, result: value }),
      );
    },
  });

  if (!written.isWritten) {
    await withWriteTransaction(context.log.writer, (tx) =>
      writeClientAction(tx, buildStoredAction({ context, caller, action, inputHash, result })),
    );
  }

  return { status: 'done', result, isReplay: false };
}

interface StoredActionParts {
  readonly context: APIContext;
  readonly caller: Identity;
  readonly action: CheckedAction;
  readonly inputHash: string;
  readonly result: JSONObject;
}

function buildStoredAction(parts: StoredActionParts) {
  return {
    clientActionID: parts.action.clientActionID,
    procedure: parts.action.procedure,
    identityID: parts.caller.identityID,
    inputHash: parts.inputHash,
    result: { result: parts.result },
    recordedAt: parts.context.clock.now(),
  };
}
